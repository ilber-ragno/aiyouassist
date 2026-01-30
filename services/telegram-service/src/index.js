import 'dotenv/config';
import express from 'express';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import botManager from './bot-manager.js';
import store from './bot-store.js';

const logger = pino({ name: 'telegram-service' });
const app = express();
const PORT = process.env.PORT || 8005;
const CORE_API_URL = process.env.CORE_API_URL || 'http://core-api:8000';
const CORE_API_INTERNAL_KEY = process.env.CORE_API_INTERNAL_KEY || '';

// Middleware
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

// Extract tenant ID from header
function getTenantId(req) {
  return req.headers['x-tenant-id'] || null;
}

// ─── Webhook to Core-API ───────────────────────────────────────────────────────

async function notifyCoreApi(event, data) {
  try {
    const url = `${CORE_API_URL}/api/webhooks/telegram-service`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': CORE_API_INTERNAL_KEY,
        'X-Correlation-ID': uuidv4(),
      },
      body: JSON.stringify({ event, ...data }),
    });
    if (!res.ok) {
      logger.warn({ event, status: res.status }, 'Core-API webhook failed');
    }
  } catch (err) {
    logger.error({ event, err: err.message }, 'Failed to notify core-api');
  }
}

// ─── Bot Manager Events ────────────────────────────────────────────────────────

botManager.on('message', (payload) => {
  notifyCoreApi('message.received', payload);
});

botManager.on('bot-connected', (payload) => {
  notifyCoreApi('bot.connected', payload);
});

botManager.on('bot-disconnected', (payload) => {
  notifyCoreApi('bot.disconnected', payload);
});

botManager.on('bot-error', (payload) => {
  notifyCoreApi('bot.error', payload);
});

// ─── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  const activeBots = botManager.listActiveBots();
  res.json({
    status: 'ok',
    service: 'telegram-service',
    activeBots: activeBots.length,
    uptime: process.uptime(),
  });
});

// ─── Bot CRUD ──────────────────────────────────────────────────────────────────

// List bots for tenant
app.get('/api/bots', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const bots = tenantId
      ? await store.getBotsByTenant(tenantId)
      : await store.getAllBots();

    // Enrich with live status
    const enriched = bots.map(b => ({
      ...b,
      live_status: botManager.getStatus(b.id),
    }));

    res.json({ bots: enriched });
  } catch (err) {
    logger.error({ err }, 'Error listing bots');
    res.status(500).json({ error: 'Internal error' });
  }
});

// Register new bot
app.post('/api/bots', async (req, res) => {
  try {
    const { token, tenant_id } = req.body;
    const tenantId = tenant_id || getTenantId(req);

    if (!token || !tenantId) {
      return res.status(400).json({ error: 'token and tenant_id are required' });
    }

    // Validate token with Telegram API
    let me;
    try {
      me = await botManager.testToken(token);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid bot token', details: err.message });
    }

    const bot = await store.createBot({
      tenant_id: tenantId,
      bot_token_encrypted: token, // TODO: encrypt in production
      bot_username: me.username,
      bot_name: me.first_name,
      status: 'disconnected',
    });

    res.status(201).json({ bot: { ...bot, telegram_user: me } });
  } catch (err) {
    logger.error({ err }, 'Error creating bot');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Bot already registered for this tenant' });
    }
    res.status(500).json({ error: 'Internal error' });
  }
});

// Delete bot
app.delete('/api/bots/:botId', async (req, res) => {
  try {
    const { botId } = req.params;

    // Stop if running
    await botManager.stopBot(botId);
    await store.deleteBot(botId);

    res.json({ message: 'Bot removed' });
  } catch (err) {
    logger.error({ err }, 'Error deleting bot');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Bot Actions ───────────────────────────────────────────────────────────────

// Test token (without saving)
app.post('/api/bots/test', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const me = await botManager.testToken(token);
    res.json({ valid: true, bot: me });
  } catch (err) {
    res.status(400).json({ valid: false, error: err.message });
  }
});

// Start polling (connect)
app.post('/api/bots/:botId/start', async (req, res) => {
  try {
    const { botId } = req.params;
    await botManager.startBot(botId);
    res.json({ status: 'connected' });
  } catch (err) {
    logger.error({ botId: req.params.botId, err }, 'Error starting bot');
    res.status(500).json({ error: err.message });
  }
});

// Stop polling (disconnect)
app.post('/api/bots/:botId/stop', async (req, res) => {
  try {
    const { botId } = req.params;
    await botManager.stopBot(botId);
    res.json({ status: 'disconnected' });
  } catch (err) {
    logger.error({ botId: req.params.botId, err }, 'Error stopping bot');
    res.status(500).json({ error: err.message });
  }
});

// ─── Send Message ──────────────────────────────────────────────────────────────

app.post('/api/send', async (req, res) => {
  try {
    const { bot_id, chat_id, text, options } = req.body;

    if (!bot_id || !chat_id || !text) {
      return res.status(400).json({ error: 'bot_id, chat_id, and text are required' });
    }

    const result = await botManager.sendMessage(bot_id, chat_id, text, options);
    res.json({ success: true, message_id: result.message_id });
  } catch (err) {
    logger.error({ err }, 'Error sending message');
    res.status(500).json({ error: err.message });
  }
});

// ─── Start Server ──────────────────────────────────────────────────────────────

async function start() {
  try {
    await botManager.initialize();

    app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT }, 'Telegram service started');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start telegram service');
    process.exit(1);
  }
}

// Graceful shutdown
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    logger.info({ signal }, 'Shutting down...');
    await botManager.shutdown();
    process.exit(0);
  });
}

start();
