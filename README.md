# AiYou Assist

Plataforma SaaS multi-tenant de assistente de IA multicanal (WhatsApp + Telegram) com base de conhecimento, integrações nativas e painel administrativo completo.

## Arquitetura

```
                    ┌──────────────┐
                    │    Nginx     │ :80/:443
                    │  (Reverse    │
                    │   Proxy)     │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌──────▼──────┐  ┌──▼───────────┐
     │ Frontend  │  │ API Gateway │  │ Landing Page │
     │   (SPA)   │  │   :8080     │  │  (Static)    │
     │   :3000   │  └──────┬──────┘  └──────────────┘
     └───────────┘         │
                    ┌──────▼──────┐
                    │  Core API   │ :8000 (Laravel)
                    │  + Worker   │
                    └──────┬──────┘
                           │
         ┌────────────┼────────────┼────────────┐
         │            │            │            │
┌────────▼──┐ ┌──────▼──────┐ ┌──▼────────┐ ┌─▼───────────┐
│ WhatsApp  │ │  Telegram   │ │  Webchat  │ │     AI      │
│ Service   │ │  Service    │ │  Service  │ │ Orchestrator│
│  :8002    │ │   :8005     │ │  :8006    │ │   :8003     │
│ (Baileys) │ │ (Bot API)   │ │(Socket.io)│ │ (Claude/GPT)│
└───────────┘ └─────────────┘ └───────────┘ └─────────────┘
         │            │            │            │
         └────────────┼────────────┼────────────┘
                      │
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──┐  ┌──────▼──────┐  ┌──▼──────────┐
     │ PostgreSQL│  │   Redis     │  │  RabbitMQ   │
     │   :5432   │  │   :6379     │  │   :5672     │
     └───────────┘  └─────────────┘  └─────────────┘
```

## Serviços

| Serviço | Porta | Tecnologia | Descricao |
|---------|-------|-----------|-----------|
| **Frontend Web** | 3000 | React + Vite + Tailwind | SPA do painel do cliente e admin |
| **API Gateway** | 8080 | Node.js + Express | Rate limiting, JWT, roteamento |
| **Core API** | 8000 | Laravel 11 (PHP) | API principal, CRUD, auth, billing |
| **Core Worker** | - | Laravel Queue Worker | Processamento async (IA, mensagens) |
| **WhatsApp Service** | 8002 | Node.js + Baileys | Conexao direta WhatsApp via QR Code |
| **Telegram Service** | 8005 | Node.js + node-telegram-bot-api | Bots Telegram via polling |
| **Webchat Service** | 8006 | Node.js + Socket.io | Widget de chat embeddable + WebSocket |
| **AI Orchestrator** | 8003 | Node.js | Roteamento multi-provider (Claude, GPT, OpenRouter) |
| **AI Worker** | - | Node.js | Processamento async de IA |
| **Billing API** | 8001 | Node.js | Gestao de assinaturas e pagamentos |
| **Customer API** | 8004 | Node.js | APIs externas do cliente (CRM, ERP) |
| **Nginx** | 80/443 | Nginx | Reverse proxy + SSL termination |

## Infraestrutura

- **PostgreSQL 16** - Banco principal (multi-tenant com tenant_id scoping)
- **Redis 7** - Cache, sessoes, rate limiting, filas Laravel
- **RabbitMQ 3.13** - Filas de mensagens async
- **Loki + Promtail** - Agregacao de logs
- **Prometheus + Grafana** - Metricas e dashboards

## Funcionalidades

### Canais de Comunicacao
- **WhatsApp** - Conexao via QR Code (Baileys), multi-sessao por tenant
- **Telegram** - Bots via @BotFather, multi-bot por tenant, polling
- **Webchat** - Widget embeddable para sites, WebSocket em tempo real, Shadow DOM

### Agente IA
- Multi-provider: Claude (Anthropic), GPT (OpenAI), OpenRouter
- Configuracoes por tenant: persona, tom, idioma, horario
- Escalacao automatica para humano
- Rate limiting e controle de custos via creditos
- Base de Conhecimento para respostas contextuais

### Base de Conhecimento
- CRUD de artigos com titulo, conteudo, categoria
- Busca por texto e filtro por categoria
- Consulta automatica pela IA durante conversas
- Ativacao/desativacao individual de artigos

### Conversas
- Listagem em tempo real de todas as conversas
- Filtro por canal (WhatsApp/Telegram), status, contato
- Historico completo de mensagens
- Eventos de handoff (IA → Humano → IA)
- Stats: conversas ativas, aguardando, resolvidas

### Multi-Tenant
- Isolamento completo por tenant_id (global scopes)
- Perfis de visao configuraveis (menu items por tenant)
- Planos com limites (sessoes, mensagens, creditos)

### Billing e Financeiro
- Planos configuráveis pelo admin
- Sistema de creditos (saldo BRL)
- Faturas com aprovacao manual
- Gateways: Stripe + Asaas (PIX, boleto, cartao)
- Dashboard financeiro administrativo

### Painel Admin
- Gestao de planos e limites
- Dashboard financeiro completo
- Gestao de WhatsApp (sessoes globais)
- Perfis de visao (menus por tenant)
- Creditos (pacotes, saldos, manual credit)
- Provedores IA globais
- Gateways de pagamento

### Logs e Auditoria
- Logs de execucao: sistema, webhook, IA, mensagens, creditos
- Auditoria de acoes (quem fez o que)
- Filtros por tipo, severidade, data, busca

### Integrações
- Customer API (CRM, ERP, E-commerce via REST)
- Webhooks bidirecionais em tempo real
- Integracoes nativas gerenciaveis pelo painel

## Estrutura de Diretórios

```
aiyou-assist/
├── docker-compose.yml
├── .env
├── README.md
├── certs/                    # Certificados SSL
├── infra/                    # Configs de infraestrutura
│   ├── nginx/
│   ├── postgres/
│   ├── grafana/
│   ├── prometheus/
│   ├── loki/
│   └── promtail/
└── services/
    ├── frontend-web/         # React SPA (Vite + Tailwind)
    │   ├── src/
    │   │   ├── pages/        # Paginas do painel
    │   │   ├── components/   # Componentes reutilizaveis
    │   │   ├── stores/       # Zustand stores
    │   │   └── lib/          # Utilitarios (api, etc)
    │   └── public/site/      # Landing page estatica
    ├── core-api/             # Laravel 11 - API principal
    │   ├── app/
    │   │   ├── Models/       # Eloquent models (tenant-scoped)
    │   │   ├── Http/Controllers/Api/
    │   │   ├── Services/     # Business logic
    │   │   ├── Jobs/         # Queue jobs
    │   │   └── ...
    │   └── routes/api.php
    ├── whatsapp-service/     # Node.js - WhatsApp (Baileys)
    │   └── src/
    ├── telegram-service/     # Node.js - Telegram bots
    │   └── src/
    ├── webchat-service/      # Node.js - Widget de chat (Socket.io)
    │   ├── src/
    │   └── public/           # widget.js embeddable
    ├── ai-orchestrator/      # Node.js - AI routing
    ├── billing-api/          # Node.js - Billing
    ├── customer-api-service/ # Node.js - External APIs
    └── api-gateway/          # Node.js - Gateway
```

## Banco de Dados (Tabelas Principais)

| Tabela | Descricao |
|--------|-----------|
| `tenants` | Organizacoes (multi-tenant) |
| `users` | Usuarios com roles |
| `plans` / `plan_limits` | Planos e limites |
| `subscriptions` / `invoices` | Assinaturas e faturas |
| `whatsapp_sessions` | Sessoes WhatsApp (QR, auth) |
| `telegram_bots` | Bots Telegram (token, status) |
| `webchat_widgets` | Widgets de webchat (config, widget_key) |
| `conversations` | Conversas multicanal |
| `messages` | Mensagens (in/out, AI/human/contact) |
| `knowledge_base_entries` | Artigos da base de conhecimento |
| `agent_settings` | Configuracoes do agente IA por tenant |
| `llm_providers` | Provedores de IA configurados |
| `credit_balances` / `credit_transactions` | Saldo e transacoes de creditos |
| `integrations` | Integracoes ativas |
| `customer_api_connections` | Conexoes API externas |
| `webhook_endpoints` / `webhook_deliveries` | Webhooks configurados |
| `execution_logs` | Logs de execucao |
| `audit_logs` | Auditoria de acoes |
| `view_profiles` | Perfis de visao (menus) |
| `payment_gateway_settings` | Configs de gateways de pagamento |

## Variaveis de Ambiente Principais

```env
# Banco
DB_PASSWORD=
DB_APP_PASSWORD=

# Auth
APP_KEY=
JWT_SECRET=

# Redis
REDIS_PASSWORD=

# RabbitMQ
RABBITMQ_PASSWORD=

# WhatsApp
SESSION_ENCRYPTION_KEY=
CORE_API_INTERNAL_KEY=

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Pagamentos
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ASAAS_API_KEY=
ASAAS_WEBHOOK_SECRET=

# Grafana
GRAFANA_PASSWORD=
```

## Deploy

```bash
# 1. Configurar .env
cp .env.example .env
# Editar variaveis

# 2. Subir tudo
docker compose up -d

# 3. Migrations (se necessario)
docker exec aiyou-core-api php artisan migrate

# 4. Frontend build (se alterar codigo)
cd services/frontend-web && npm run build
docker cp dist/. aiyou-frontend-web:/usr/share/nginx/html/

# 5. Cache
docker exec aiyou-core-api php artisan config:cache
docker exec aiyou-core-api php artisan route:cache
```

## Paginas do Frontend

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Overview | `/` | Dashboard com metricas |
| Assinatura | `/subscription` | Plano atual, faturas |
| WhatsApp | `/whatsapp` | Conexao via QR Code |
| Telegram | `/telegram` | Gestao de bots |
| Webchat | `/webchat` | Widget de chat para sites |
| Conversas | `/conversations` | Log de conversas em tempo real |
| Agente IA | `/agent` | Persona, tom, regras |
| Provedores IA | `/llm-providers` | Multi-provider config |
| Base de Conhecimento | `/knowledge-base` | Artigos e FAQs |
| Integracoes | `/integrations` | CRM, ERP, etc |
| Customer API | `/customer-api` | APIs externas |
| Webhooks | `/webhooks` | Endpoints webhook |
| Logs | `/logs` | Logs de execucao |
| Auditoria | `/audit` | Trail de auditoria |
| Equipe | `/team` | Usuarios e tokens |
| Creditos | `/credits` | Saldo e pacotes |
| Configuracoes | `/settings` | Empresa, notificacoes |
| Checkout | `/checkout` | Escolha de plano |

### Paginas Admin (role: admin)
| Pagina | Rota |
|--------|------|
| Planos | `/admin/plans` |
| Financeiro | `/admin/billing` |
| WhatsApp Admin | `/admin/whatsapp` |
| Perfis de Visao | `/admin/view-profiles` |
| Creditos Admin | `/admin/credits` |
| Provedores IA | `/admin/llm-providers` |
| Gateways | `/admin/payment-gateways` |

## Fluxo de Mensagem

```
Cliente envia msg (WhatsApp/Telegram/Webchat)
    │
    ▼
whatsapp-service / telegram-service / webchat-service
    │ POST /api/webhooks/{service}
    ▼
Core API (WebhookController)
    │ handleMessageReceived()
    ▼
ClaudBotService / TelegramService / WebchatService
    │ Find/Create Conversation + Message
    ▼
ProcessIncomingMessage (Queue Job)
    │ Load history, agent settings
    ▼
AI Orchestrator (:8003)
    │ Select provider, process, deduct credits
    ▼
AI Response (action: respond/escalate/ignore)
    │
    ▼
sendAiReply() → channel detection
    ├── WhatsApp → ClaudBotService → whatsapp-service
    ├── Telegram → TelegramService → telegram-service
    └── Webchat  → WebchatService  → webchat-service → WebSocket → browser
```
