/**
 * AiYou Assist - AI Orchestrator
 *
 * Orchestrates AI responses with:
 * - Multi-provider support (Anthropic, OpenAI, Groq, Mistral, Cohere, Google)
 * - Budget enforcement per provider
 * - Policy enforcement
 * - Cost tracking per LLM provider
 * - Confidence scoring
 * - Escalation decisions
 */

import express from 'express';
import pinoHttp from 'pino-http';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import pg from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8003;

// Infrastructure clients (DB, Redis)
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL);

// Fallback global clients (used when no provider in DB)
const fallbackAnthropicKey = process.env.ANTHROPIC_API_KEY;
const fallbackOpenaiKey = process.env.OPENAI_API_KEY;

const CORE_API_URL = process.env.CORE_API_URL || 'http://core-api:8000';
const INTERNAL_KEY = process.env.CORE_API_INTERNAL_KEY || '';

app.use(pinoHttp({ level: process.env.LOG_LEVEL || 'info' }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ai-orchestrator' });
});

/**
 * Resolve LLM provider for a tenant.
 * First tries the DB (llm_providers table), then falls back to env vars.
 */
async function resolveProvider(tenantId, requestedProviderId) {
  // If a specific provider was requested
  if (requestedProviderId) {
    const result = await pool.query(
      `SELECT id, provider_type, model, api_key_encrypted, budget_limit_usd
       FROM llm_providers
       WHERE id = $1 AND tenant_id = $2 AND is_active = true AND deleted_at IS NULL`,
      [requestedProviderId, tenantId]
    );
    if (result.rows.length > 0) return result.rows[0];
  }

  // Try default provider for tenant
  const result = await pool.query(
    `SELECT id, provider_type, model, api_key_encrypted, budget_limit_usd
     FROM llm_providers
     WHERE tenant_id = $1 AND is_active = true AND is_default = true AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId]
  );
  if (result.rows.length > 0) return result.rows[0];

  // Try any active provider by priority
  const anyResult = await pool.query(
    `SELECT id, provider_type, model, api_key_encrypted, budget_limit_usd
     FROM llm_providers
     WHERE tenant_id = $1 AND is_active = true AND deleted_at IS NULL
     ORDER BY priority ASC, created_at ASC
     LIMIT 1`,
    [tenantId]
  );
  if (anyResult.rows.length > 0) return anyResult.rows[0];

  // Try global default provider (tenant_id IS NULL, admin-configured)
  const globalDefault = await pool.query(
    `SELECT id, provider_type, model, api_key_encrypted, budget_limit_usd
     FROM llm_providers
     WHERE tenant_id IS NULL AND is_active = true AND is_default = true AND deleted_at IS NULL
     LIMIT 1`
  );
  if (globalDefault.rows.length > 0) return globalDefault.rows[0];

  // Try any active global provider
  const globalAny = await pool.query(
    `SELECT id, provider_type, model, api_key_encrypted, budget_limit_usd
     FROM llm_providers
     WHERE tenant_id IS NULL AND is_active = true AND deleted_at IS NULL
     ORDER BY priority ASC, created_at ASC
     LIMIT 1`
  );
  if (globalAny.rows.length > 0) return globalAny.rows[0];

  // Fallback: use env vars
  if (fallbackAnthropicKey) {
    return {
      id: null,
      provider_type: 'anthropic',
      model: process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514',
      _apiKey: fallbackAnthropicKey,
      budget_limit_usd: null,
    };
  }
  if (fallbackOpenaiKey) {
    return {
      id: null,
      provider_type: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      _apiKey: fallbackOpenaiKey,
      budget_limit_usd: null,
    };
  }

  return null;
}

/**
 * Get the API key from a provider record.
 * If the key is stored encrypted via Laravel's encrypt(), we call the internal API.
 * If it's a fallback provider with _apiKey, use it directly.
 */
async function getProviderApiKey(provider, tenantId) {
  if (provider._apiKey) return provider._apiKey;

  // Call core-api internal endpoint to get decrypted key
  try {
    const response = await fetch(`${CORE_API_URL}/api/internal/llm-providers/${tenantId}/default`, {
      headers: {
        'X-Internal-Key': INTERNAL_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data.error === 'budget_exhausted') {
        throw new Error('BUDGET_EXHAUSTED');
      }
      throw new Error(`Internal API error: ${response.status}`);
    }

    const data = await response.json();
    return data.provider?.api_key;
  } catch (err) {
    if (err.message === 'BUDGET_EXHAUSTED') throw err;
    console.error('Failed to get API key from core-api:', err.message);
    // Last resort fallback
    if (fallbackAnthropicKey && provider.provider_type === 'anthropic') return fallbackAnthropicKey;
    if (fallbackOpenaiKey && provider.provider_type === 'openai') return fallbackOpenaiKey;
    throw new Error('Unable to resolve API key for provider');
  }
}

// =============================================================================
// Tool Definitions (Moltbot/Clawdbot Skills)
// =============================================================================

const TOOL_SCHEMAS = [
  {
    name: 'customer_lookup',
    description: 'Busca informacoes de um cliente pelo telefone, email ou nome. Use quando o usuario perguntar sobre dados cadastrais, historico ou informacoes de conta.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Telefone, email ou nome do cliente' },
        field: { type: 'string', enum: ['phone', 'email', 'name', 'auto'], description: 'Campo de busca (auto detecta automaticamente)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'knowledge_base',
    description: 'Busca na base de conhecimento/FAQ do negocio. Use para responder perguntas sobre produtos, servicos, politicas, horarios, precos e informacoes gerais.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pergunta ou termos de busca' },
        category: { type: 'string', description: 'Categoria opcional para filtrar (ex: produtos, politicas, faq)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_order_status',
    description: 'Verifica o status de um pedido pelo ID do pedido ou telefone do cliente. Use quando perguntarem sobre status de pedido, entrega ou compra.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'ID do pedido' },
        phone: { type: 'string', description: 'Telefone do cliente (busca pedidos recentes)' },
      },
    },
  },
  {
    name: 'schedule_appointment',
    description: 'Verifica disponibilidade e agenda horarios. Use quando o cliente quiser agendar, remarcar ou verificar horarios disponiveis.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['check_availability', 'book', 'cancel', 'reschedule'], description: 'Acao desejada' },
        date: { type: 'string', description: 'Data desejada (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Horario desejado (HH:MM)' },
        service: { type: 'string', description: 'Tipo de servico' },
        customer_phone: { type: 'string', description: 'Telefone do cliente' },
      },
      required: ['action'],
    },
  },
];

/**
 * Filter tool schemas based on agent_settings.allowed_tools
 */
function getToolsForAgent(agentSettings) {
  const allowed = agentSettings?.allowed_tools;
  if (!allowed || !Array.isArray(allowed) || allowed.length === 0) {
    return TOOL_SCHEMAS;
  }
  return TOOL_SCHEMAS.filter(t => allowed.includes(t.name));
}

/**
 * Execute a tool and return the result.
 * All queries are tenant-scoped for security.
 */
async function executeTool(name, input, tenantId, contactPhone) {
  const start = Date.now();
  let result;

  try {
    switch (name) {
      case 'customer_lookup':
        result = await toolCustomerLookup(tenantId, input, contactPhone);
        break;
      case 'knowledge_base':
        result = await toolKnowledgeBase(tenantId, input);
        break;
      case 'check_order_status':
        result = await toolCheckOrderStatus(tenantId, input, contactPhone);
        break;
      case 'schedule_appointment':
        result = await toolScheduleAppointment(tenantId, input, contactPhone);
        break;
      default:
        result = { error: `Tool desconhecido: ${name}` };
    }
  } catch (err) {
    console.error(`Tool execution error [${name}]:`, err.message);
    result = { error: `Erro ao executar ${name}: ${err.message}` };
  }

  return {
    result,
    duration_ms: Date.now() - start,
  };
}

async function toolCustomerLookup(tenantId, input, contactPhone) {
  const query = input.query || contactPhone;
  if (!query) return { found: false, message: 'Nenhum termo de busca fornecido' };

  // Try contacts table (conversations have contact_phone/contact_name)
  const res = await pool.query(
    `SELECT DISTINCT contact_phone, contact_name,
            COUNT(*) as total_conversations,
            MAX(last_message_at) as last_interaction
     FROM conversations
     WHERE tenant_id = $1
       AND (contact_phone ILIKE $2 OR contact_name ILIKE $2)
     GROUP BY contact_phone, contact_name
     LIMIT 5`,
    [tenantId, `%${query}%`]
  );

  if (res.rows.length === 0) {
    return { found: false, message: `Nenhum cliente encontrado para "${query}"` };
  }

  return {
    found: true,
    customers: res.rows.map(r => ({
      phone: r.contact_phone,
      name: r.contact_name,
      total_conversations: parseInt(r.total_conversations),
      last_interaction: r.last_interaction,
    })),
  };
}

async function toolKnowledgeBase(tenantId, input) {
  // Check if knowledge_base_entries table exists
  try {
    const res = await pool.query(
      `SELECT id, title, content, category
       FROM knowledge_base_entries
       WHERE tenant_id = $1
         AND (title ILIKE $2 OR content ILIKE $2 OR category ILIKE $3)
         AND is_active = true
       ORDER BY
         CASE WHEN title ILIKE $2 THEN 0 ELSE 1 END,
         updated_at DESC
       LIMIT 5`,
      [tenantId, `%${input.query}%`, `%${input.category || input.query}%`]
    );

    if (res.rows.length === 0) {
      return { found: false, message: `Nenhum artigo encontrado para "${input.query}"` };
    }

    return {
      found: true,
      articles: res.rows.map(r => ({
        title: r.title,
        content: r.content,
        category: r.category,
      })),
    };
  } catch (err) {
    // Table may not exist yet
    if (err.code === '42P01') {
      return { found: false, message: 'Base de conhecimento ainda nao configurada para este tenant.' };
    }
    throw err;
  }
}

async function toolCheckOrderStatus(tenantId, input, contactPhone) {
  try {
    let res;
    if (input.order_id) {
      res = await pool.query(
        `SELECT id, status, total, created_at, updated_at
         FROM orders
         WHERE tenant_id = $1 AND (id::text = $2 OR external_id = $2)
         LIMIT 1`,
        [tenantId, input.order_id]
      );
    } else {
      const phone = input.phone || contactPhone;
      if (!phone) return { found: false, message: 'Informe o ID do pedido ou telefone' };
      res = await pool.query(
        `SELECT id, status, total, created_at, updated_at
         FROM orders
         WHERE tenant_id = $1 AND customer_phone = $2
         ORDER BY created_at DESC
         LIMIT 3`,
        [tenantId, phone]
      );
    }

    if (res.rows.length === 0) {
      return { found: false, message: 'Nenhum pedido encontrado' };
    }

    return {
      found: true,
      orders: res.rows.map(r => ({
        id: r.id,
        status: r.status,
        total: r.total,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    };
  } catch (err) {
    if (err.code === '42P01') {
      return { found: false, message: 'Sistema de pedidos ainda nao configurado.' };
    }
    throw err;
  }
}

async function toolScheduleAppointment(tenantId, input, contactPhone) {
  try {
    switch (input.action) {
      case 'check_availability': {
        const date = input.date || new Date().toISOString().slice(0, 10);
        const res = await pool.query(
          `SELECT time_slot, is_available
           FROM appointment_slots
           WHERE tenant_id = $1 AND date = $2 AND is_available = true
           ORDER BY time_slot`,
          [tenantId, date]
        );
        return {
          date,
          available_slots: res.rows.map(r => r.time_slot),
          total_available: res.rows.length,
        };
      }
      case 'book': {
        if (!input.date || !input.time) {
          return { success: false, message: 'Data e horario sao obrigatorios para agendar' };
        }
        // Check if slot is available
        const check = await pool.query(
          `SELECT id FROM appointment_slots
           WHERE tenant_id = $1 AND date = $2 AND time_slot = $3 AND is_available = true`,
          [tenantId, input.date, input.time]
        );
        if (check.rows.length === 0) {
          return { success: false, message: `Horario ${input.time} em ${input.date} nao esta disponivel` };
        }
        // Book it
        await pool.query(
          `UPDATE appointment_slots SET is_available = false, customer_phone = $3
           WHERE tenant_id = $1 AND date = $2 AND time_slot = $4`,
          [tenantId, input.date, contactPhone || input.customer_phone, input.time]
        );
        return { success: true, message: `Agendamento confirmado para ${input.date} as ${input.time}` };
      }
      case 'cancel':
      case 'reschedule':
        return { success: false, message: `Acao "${input.action}" requer atendimento humano para confirmacao.` };
      default:
        return { error: `Acao desconhecida: ${input.action}` };
    }
  } catch (err) {
    if (err.code === '42P01') {
      return { found: false, message: 'Sistema de agendamento ainda nao configurado.' };
    }
    throw err;
  }
}

// =============================================================================
// LLM Calling with Tool-Use Support
// =============================================================================

/**
 * Call the appropriate LLM API based on provider type.
 * For Anthropic, supports tool_use loop (max 5 iterations).
 */
async function callLlm(providerType, apiKey, model, systemPrompt, messages, maxTokens, tools, tenantId, contactPhone) {
  switch (providerType) {
    case 'anthropic': {
      const client = new Anthropic({ apiKey });

      // Build initial request params
      const params = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [...messages],
      };

      // Add tools if available
      if (tools && tools.length > 0) {
        params.tools = tools;
      }

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const toolsUsed = [];
      const MAX_TOOL_ITERATIONS = 5;

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const response = await client.messages.create(params);

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        // If no tool use, extract text and return
        if (response.stop_reason !== 'tool_use') {
          const textBlock = response.content.find(b => b.type === 'text');
          return {
            content: textBlock?.text || '',
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            tools_used: toolsUsed,
          };
        }

        // Handle tool_use blocks
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          console.log(`Executing tool: ${toolUse.name}`, JSON.stringify(toolUse.input));
          const { result, duration_ms } = await executeTool(toolUse.name, toolUse.input, tenantId, contactPhone);
          toolsUsed.push({ name: toolUse.name, input: toolUse.input, duration_ms });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        // Extend conversation with assistant response + tool results
        params.messages.push({ role: 'assistant', content: response.content });
        params.messages.push({ role: 'user', content: toolResults });
      }

      // If we hit max iterations, make one final call without tools to force a text response
      delete params.tools;
      const finalResponse = await client.messages.create(params);
      totalInputTokens += finalResponse.usage.input_tokens;
      totalOutputTokens += finalResponse.usage.output_tokens;
      const textBlock = finalResponse.content.find(b => b.type === 'text');
      return {
        content: textBlock?.text || '',
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        tools_used: toolsUsed,
      };
    }

    case 'openai':
    case 'groq':
    case 'mistral':
    case 'openrouter': {
      const baseURLs = {
        openai: 'https://api.openai.com/v1',
        groq: 'https://api.groq.com/openai/v1',
        mistral: 'https://api.mistral.ai/v1',
        openrouter: 'https://openrouter.ai/api/v1',
      };
      const clientHeaders = providerType === 'openrouter'
        ? { 'HTTP-Referer': 'https://meuaiyou.cloud', 'X-Title': 'AiYou Assist' }
        : {};
      const client = new OpenAI({ apiKey, baseURL: baseURLs[providerType], defaultHeaders: clientHeaders, timeout: 55000 });
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      });
      return {
        content: response.choices[0]?.message?.content || '',
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
        tools_used: [],
      };
    }

    case 'google': {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      // Prepend system as first user message if Google
      if (systemPrompt) {
        contents.unshift({ role: 'user', parts: [{ text: systemPrompt }] });
        contents.splice(1, 0, { role: 'model', parts: [{ text: 'Entendido.' }] });
      }
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens } }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error?.message || 'Google API error');
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usage = data.usageMetadata || {};
      return {
        content: text,
        input_tokens: usage.promptTokenCount || 0,
        output_tokens: usage.candidatesTokenCount || 0,
        tools_used: [],
      };
    }

    case 'cohere': {
      const resp = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
          ],
          max_tokens: maxTokens,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || 'Cohere API error');
      return {
        content: data.message?.content?.[0]?.text || '',
        input_tokens: data.usage?.billed_units?.input_tokens || 0,
        output_tokens: data.usage?.billed_units?.output_tokens || 0,
        tools_used: [],
      };
    }

    default:
      throw new Error(`Unsupported provider: ${providerType}`);
  }
}

/**
 * Check if provider budget is exhausted (local check via DB)
 */
async function checkBudget(provider) {
  if (!provider.id || !provider.budget_limit_usd) return { ok: true };

  const result = await pool.query(
    `SELECT COALESCE(SUM(cost_usd), 0) as spent
     FROM ai_decisions
     WHERE llm_provider_id = $1
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
    [provider.id]
  );

  const spent = parseFloat(result.rows[0]?.spent || 0);
  const budget = parseFloat(provider.budget_limit_usd);

  if (spent >= budget) {
    return { ok: false, spent, budget };
  }
  return { ok: true, spent, budget };
}

// Process message with AI
app.post('/api/process', async (req, res) => {
  const {
    tenant_id,
    conversation_id,
    message,
    agent_settings,
    conversation_history = [],
    llm_provider_id,
    contact_phone,
    is_test,
    provider_override,
  } = req.body;

  const startTime = Date.now();
  const decisionId = uuidv4();

  try {
    // Ensure agent_settings is always an object (may be null if tenant has no config)
    const settings = agent_settings || {};

    // Check response_mode: should we respond to this contact?
    if (!is_test && settings.response_mode && settings.response_mode !== 'all' && contact_phone) {
      if (settings.response_mode === 'owner_only') {
        // Check if contact_phone matches the WhatsApp session phone
        const sessionResult = await pool.query(
          `SELECT ws.phone_number FROM whatsapp_sessions ws
           JOIN conversations c ON c.whatsapp_session_id = ws.id
           WHERE c.id = $1 AND ws.tenant_id = $2 LIMIT 1`,
          [conversation_id, tenant_id]
        );
        const sessionPhone = sessionResult.rows[0]?.phone_number;
        if (sessionPhone && !contact_phone.includes(sessionPhone) && !sessionPhone.includes(contact_phone)) {
          return res.json({
            decision_id: decisionId,
            action: 'ignore',
            content: '',
            reason: 'response_mode_owner_only',
            should_escalate: false,
          });
        }
      } else if (settings.response_mode === 'whitelist') {
        const whitelist = settings.whitelisted_phones || [];
        const isWhitelisted = whitelist.some(w => contact_phone.includes(w) || w.includes(contact_phone));
        if (!isWhitelisted) {
          return res.json({
            decision_id: decisionId,
            action: 'ignore',
            content: '',
            reason: 'response_mode_whitelist',
            should_escalate: false,
          });
        }
      }
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(settings);

    // Check forbidden topics
    const forbiddenMatch = checkForbiddenTopics(message, settings.forbidden_topics);
    if (forbiddenMatch) {
      return res.json({
        decision_id: decisionId,
        action: 'blocked',
        content: 'Desculpe, nao posso ajudar com esse assunto.',
        reason: 'forbidden_topic',
        should_escalate: false,
      });
    }

    // Check operating hours
    if (!isWithinOperatingHours(settings.operating_hours)) {
      return res.json({
        decision_id: decisionId,
        action: 'out_of_hours',
        content: settings.out_of_hours_message || 'Nosso atendimento esta fora do horario. Retornaremos em breve.',
        should_escalate: false,
      });
    }

    // Check credit balance before calling LLM (skip for tests)
    if (!is_test) {
      try {
        const creditResp = await fetch(`${CORE_API_URL}/api/internal/credits/check/${tenant_id}`, {
          headers: { 'X-Internal-Key': INTERNAL_KEY, 'Accept': 'application/json' },
        });
        if (creditResp.ok) {
          const creditData = await creditResp.json();
          if (!creditData.sufficient) {
            return res.status(429).json({
              decision_id: decisionId,
              action: 'budget_exhausted',
              content: 'Seus créditos foram esgotados. Adquira mais créditos para continuar usando o assistente.',
              error: 'credit_exhausted',
              should_escalate: true,
            });
          }
        }
      } catch (creditErr) {
        console.warn('Credit check failed (continuing):', creditErr.message);
      }
    }

    // Resolve provider (use override if provided to avoid callback deadlock)
    let provider;
    let apiKey;

    if (provider_override && provider_override.api_key) {
      provider = {
        id: provider_override.id,
        provider_type: provider_override.provider_type,
        model: provider_override.model,
        _apiKey: provider_override.api_key,
      };
      apiKey = provider_override.api_key;
    } else {
      provider = await resolveProvider(tenant_id, llm_provider_id);
      if (!provider) {
        return res.status(422).json({
          decision_id: decisionId,
          action: 'error',
          error: 'Nenhum provedor de IA configurado. Configure em Configuracoes > Provedores de IA.',
          should_escalate: true,
        });
      }

      // Check budget
      const budgetCheck = await checkBudget(provider);
      if (!budgetCheck.ok) {
        return res.status(429).json({
          decision_id: decisionId,
          action: 'budget_exhausted',
          error: `Orcamento mensal esgotado (gasto: $${budgetCheck.spent.toFixed(2)} / limite: $${budgetCheck.budget.toFixed(2)})`,
          should_escalate: true,
        });
      }

      // Get API key
      try {
        apiKey = await getProviderApiKey(provider, tenant_id);
      } catch (err) {
        if (err.message === 'BUDGET_EXHAUSTED') {
          return res.status(429).json({
            decision_id: decisionId,
            action: 'budget_exhausted',
            error: 'Orcamento mensal esgotado',
            should_escalate: true,
          });
        }
        throw err;
      }
    }

    if (!apiKey) {
      return res.status(422).json({
        decision_id: decisionId,
        action: 'error',
        error: 'Chave de API nao encontrada para o provedor',
        should_escalate: true,
      });
    }

    // Build messages for API (token-aware windowing)
    const maxContextTokens = getModelContextLimit(provider.model) * 0.8;
    const windowedHistory = windowConversationHistory(conversation_history, maxContextTokens);
    const messages = [
      ...windowedHistory.map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    // Resolve tools for this agent
    const tools = getToolsForAgent(settings);
    const contactPhone = req.body.contact_phone || null;

    // Enrich system prompt with available tools info
    const enrichedSystemPrompt = enrichSystemPromptWithTools(systemPrompt, tools);

    // Call LLM (with tool-use support for Anthropic)
    const model = provider.model;
    const llmResponse = await callLlm(
      provider.provider_type,
      apiKey,
      model,
      enrichedSystemPrompt,
      messages,
      settings.max_response_tokens || 1024,
      tools,
      tenant_id,
      contactPhone
    );

    const content = llmResponse.content;
    const inputTokens = llmResponse.input_tokens;
    const outputTokens = llmResponse.output_tokens;
    const toolsUsed = llmResponse.tools_used || [];

    // Calculate cost
    const costUsd = calculateCost(model, inputTokens, outputTokens);

    // Analyze confidence and escalation need
    const confidence = analyzeConfidence(content, message);
    const shouldEscalate = checkEscalation(settings.escalation_rules, {
      message,
      response: content,
      confidence,
    });

    // Log decision (skip for test prompts without conversation_id)
    if (conversation_id) {
      await logDecision(pool, {
        id: decisionId,
        tenant_id,
        conversation_id,
        decision_type: shouldEscalate ? 'escalate' : 'respond',
        input_context: { message, history_length: conversation_history.length },
        model_used: model,
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        cost_usd: costUsd,
        confidence_score: confidence,
        tools_used: toolsUsed,
        output_action: shouldEscalate ? 'escalate' : 'send_message',
        output_content: content,
        duration_ms: Date.now() - startTime,
        llm_provider_id: provider.id || null,
      });
    }

    // Deduct credits after AI usage (skip for tests)
    let creditBalance = null;
    if (!is_test && costUsd > 0) {
      try {
        const deductResp = await fetch(`${CORE_API_URL}/api/internal/credits/deduct`, {
          method: 'POST',
          headers: {
            'X-Internal-Key': INTERNAL_KEY,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            tenant_id,
            cost_usd: costUsd,
            total_tokens: inputTokens + outputTokens,
            model,
            ai_decision_id: decisionId,
          }),
        });
        if (deductResp.ok) {
          const deductData = await deductResp.json();
          creditBalance = deductData.balance_brl;
        }
      } catch (deductErr) {
        console.warn('Credit deduction failed:', deductErr.message);
      }
    }

    // Track usage in Redis
    await trackUsage(redis, tenant_id, inputTokens + outputTokens);

    res.json({
      decision_id: decisionId,
      action: shouldEscalate ? 'escalate' : 'respond',
      content,
      confidence,
      should_escalate: shouldEscalate,
      provider: {
        id: provider.id,
        type: provider.provider_type,
        model,
      },
      tools_used: toolsUsed,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        total_cost: costUsd,
      },
      credit_balance_brl: creditBalance,
    });

  } catch (err) {
    console.error('AI processing error:', err);
    res.status(500).json({
      decision_id: decisionId,
      action: 'error',
      error: err.message,
      should_escalate: true,
    });
  }
});

// Get AI usage stats for tenant
app.get('/api/usage/:tenantId', async (req, res) => {
  const { tenantId } = req.params;

  const monthKey = `usage:${tenantId}:${new Date().toISOString().slice(0, 7)}`;
  const tokens = await redis.get(monthKey) || 0;

  const costResult = await pool.query(
    `SELECT COALESCE(SUM(cost_usd), 0) as total_cost,
            COALESCE(SUM(prompt_tokens), 0) as total_input,
            COALESCE(SUM(completion_tokens), 0) as total_output,
            COUNT(*) as total_decisions
     FROM ai_decisions
     WHERE tenant_id = $1
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
    [tenantId]
  );

  // Per-provider breakdown
  const perProvider = await pool.query(
    `SELECT lp.id, lp.name, lp.provider_type, lp.model,
            COALESCE(SUM(ad.cost_usd), 0) as spent_usd,
            COALESCE(SUM(ad.prompt_tokens), 0) as input_tokens,
            COALESCE(SUM(ad.completion_tokens), 0) as output_tokens,
            COUNT(ad.id) as requests
     FROM llm_providers lp
     LEFT JOIN ai_decisions ad ON ad.llm_provider_id = lp.id
       AND ad.created_at >= date_trunc('month', CURRENT_DATE)
     WHERE lp.tenant_id = $1 AND lp.deleted_at IS NULL
     GROUP BY lp.id, lp.name, lp.provider_type, lp.model`,
    [tenantId]
  );

  res.json({
    tenant_id: tenantId,
    period: new Date().toISOString().slice(0, 7),
    tokens_used: parseInt(tokens),
    ...costResult.rows[0],
    providers: perProvider.rows,
  });
});

// Helper functions

/**
 * Get model context window size (in tokens).
 */
function getModelContextLimit(model) {
  const limits = {
    'claude-sonnet-4-20250514': 200000,
    'claude-opus-4-20250514': 200000,
    'claude-opus-4-5-20251101': 200000,
    'claude-haiku-3-20250314': 200000,
    'claude-3-5-haiku-20241022': 200000,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gemini-2.0-flash': 1000000,
    'gemini-1.5-pro': 2000000,
  };
  return limits[model] || 100000;
}

/**
 * Window conversation history by estimated token count.
 * Walk backwards accumulating messages until we hit the token budget.
 */
function windowConversationHistory(history, maxTokens) {
  if (!history || history.length === 0) return [];

  let tokenCount = 0;
  const result = [];

  // Walk from most recent to oldest
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const estimatedTokens = Math.ceil((msg.content || '').length / 4);
    if (tokenCount + estimatedTokens > maxTokens) break;
    tokenCount += estimatedTokens;
    result.unshift(msg);
  }

  return result;
}

/**
 * Enrich system prompt with info about available tools.
 */
function enrichSystemPromptWithTools(basePrompt, tools) {
  if (!tools || tools.length === 0) return basePrompt;

  let toolsSection = '\n\nVoce tem acesso as seguintes ferramentas para consultar informacoes reais do sistema:';
  for (const tool of tools) {
    toolsSection += `\n- ${tool.name}: ${tool.description}`;
  }
  toolsSection += '\n\nUse as ferramentas quando o cliente perguntar algo que pode ser respondido com dados reais do sistema.';
  toolsSection += ' Nao invente dados — se a ferramenta retornar que nao encontrou, informe isso ao cliente.';

  return basePrompt + toolsSection;
}

function buildSystemPrompt(settings) {
  let prompt = settings.persona || 'Voce e um assistente virtual prestativo e profissional.';
  prompt += `\n\nTom: ${settings.tone || 'profissional'}`;
  prompt += `\nIdioma: ${settings.language || 'pt-BR'}`;

  if (settings.forbidden_topics?.length) {
    prompt += `\n\nNunca discuta os seguintes assuntos: ${settings.forbidden_topics.join(', ')}`;
  }

  prompt += '\n\nSeja conciso e direto. Se nao souber a resposta, diga honestamente.';

  return prompt;
}

function checkForbiddenTopics(message, topics) {
  if (!topics?.length) return null;
  const lowerMessage = message.toLowerCase();
  return topics.find(t => lowerMessage.includes(t.toLowerCase()));
}

function isWithinOperatingHours(hours) {
  if (!hours?.schedule) return true;
  return true;
}

function analyzeConfidence(response, input) {
  const uncertainPhrases = ['nao tenho certeza', 'nao sei', 'talvez', 'pode ser', 'nao consigo'];
  const lower = response.toLowerCase();

  let confidence = 0.85;
  for (const phrase of uncertainPhrases) {
    if (lower.includes(phrase)) {
      confidence -= 0.15;
    }
  }

  return Math.max(0.1, Math.min(1.0, confidence));
}

function checkEscalation(rules, context) {
  if (!rules) return false;

  if (rules.keywords?.length) {
    const lowerMessage = context.message.toLowerCase();
    for (const keyword of rules.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }

  if (context.confidence < (rules.min_confidence || 0.5)) {
    return true;
  }

  return false;
}

function calculateCost(model, inputTokens, outputTokens) {
  const pricing = {
    // Anthropic
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-opus-4-20250514': { input: 15, output: 75 },
    'claude-opus-4-5-20251101': { input: 15, output: 75 },
    'claude-haiku-3-20250314': { input: 0.25, output: 1.25 },
    'claude-3-5-haiku-20241022': { input: 0.25, output: 1.25 },
    // OpenAI
    'gpt-4o': { input: 2.50, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10, output: 30 },
    // Groq
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    // Mistral
    'mistral-large-latest': { input: 2, output: 6 },
    'mistral-small-latest': { input: 0.20, output: 0.60 },
    // Cohere
    'command-r-plus': { input: 2.50, output: 10 },
    'command-r': { input: 0.15, output: 0.60 },
    // Google
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-1.5-pro': { input: 1.25, output: 5 },
  };

  const prices = pricing[model] || { input: 3, output: 15 };
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

async function logDecision(pool, decision) {
  // tools_used is text[] in PostgreSQL — pass as array of tool name strings
  const toolNames = Array.isArray(decision.tools_used)
    ? decision.tools_used.map(t => typeof t === 'string' ? t : t.name)
    : [];

  await pool.query(
    `INSERT INTO ai_decisions (id, tenant_id, conversation_id, decision_type, input_context,
       model_used, prompt_tokens, completion_tokens, cost_usd, confidence_score,
       tools_used, output_action, output_content, duration_ms, llm_provider_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      decision.id, decision.tenant_id, decision.conversation_id, decision.decision_type,
      JSON.stringify(decision.input_context), decision.model_used, decision.prompt_tokens,
      decision.completion_tokens, decision.cost_usd, decision.confidence_score,
      toolNames, decision.output_action, decision.output_content, decision.duration_ms,
      decision.llm_provider_id,
    ]
  );
}

async function trackUsage(redis, tenantId, tokens) {
  const monthKey = `usage:${tenantId}:${new Date().toISOString().slice(0, 7)}`;
  await redis.incrby(monthKey, tokens);
  await redis.expire(monthKey, 60 * 60 * 24 * 35);
}

app.listen(PORT, () => {
  console.log(`AI Orchestrator running on port ${PORT}`);
});
