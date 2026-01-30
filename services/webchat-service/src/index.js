import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import store from './widget-store.js';
import sessionManager from './session-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = pino({ name: 'webchat-service' });
const app = express();
const httpServer = createServer(app);

const PORT = process.env.PORT || 8006;
const CORE_API_URL = process.env.CORE_API_URL || 'http://core-api:8000';
const CORE_API_INTERNAL_KEY = process.env.CORE_API_INTERNAL_KEY || '';

// Socket.io server
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/ws',
  pingInterval: 25000,
  pingTimeout: 20000,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

// Serve static widget files
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// Extract tenant ID from header
function getTenantId(req) {
  return req.headers['x-tenant-id'] || null;
}

// ─── Webhook to Core-API ────────────────────────────────────────────────────

async function notifyCoreApi(event, data) {
  try {
    const url = `${CORE_API_URL}/api/webhooks/webchat-service`;
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

// ─── Socket.io ──────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  logger.debug({ socketId: socket.id }, 'New socket connection');

  socket.on('join', async ({ widgetKey, sessionId }) => {
    try {
      if (!widgetKey || !sessionId) {
        socket.emit('error', { message: 'widgetKey and sessionId are required' });
        return;
      }

      const widget = await store.getWidgetByKey(widgetKey);
      if (!widget || !widget.is_active) {
        socket.emit('error', { message: 'Widget not found or inactive' });
        return;
      }

      // Store widget info on socket for later use
      socket.widgetKey = widgetKey;
      socket.sessionId = sessionId;
      socket.tenantId = widget.tenant_id;

      sessionManager.addSocket(sessionId, socket);

      // Send config to client
      socket.emit('config', {
        primaryColor: widget.primary_color,
        welcomeMessage: widget.welcome_message,
        botName: widget.bot_name,
        botAvatar: widget.bot_avatar_url,
        position: widget.position,
      });

      logger.info({ widgetKey, sessionId, socketId: socket.id }, 'Client joined');
    } catch (err) {
      logger.error({ err: err.message }, 'Error handling join');
      socket.emit('error', { message: 'Internal error' });
    }
  });

  socket.on('message', async ({ text, visitorName }) => {
    try {
      const { widgetKey, sessionId, tenantId } = socket;
      if (!widgetKey || !sessionId) {
        socket.emit('error', { message: 'Not joined yet' });
        return;
      }

      if (!text || !text.trim()) return;

      logger.info({ widgetKey, sessionId, text: text.substring(0, 50) }, 'Message received from visitor');

      // Notify core-api
      await notifyCoreApi('message.received', {
        widgetKey,
        sessionId,
        tenantId,
        text: text.trim(),
        visitorName: visitorName || 'Visitante Web',
      });

      // Send typing indicator
      sessionManager.sendTyping(sessionId, true);
    } catch (err) {
      logger.error({ err: err.message }, 'Error handling message');
    }
  });

  socket.on('disconnect', () => {
    sessionManager.removeSocket(socket.id);
    logger.debug({ socketId: socket.id }, 'Socket disconnected');
  });
});

// ─── Health ─────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'webchat-service',
    activeSessions: sessionManager.getActiveSessions(),
    uptime: process.uptime(),
  });
});

// ─── Widget JS ──────────────────────────────────────────────────────────────

app.get('/widget.js', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'widget.js'), {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

// ─── Public Widget Config ───────────────────────────────────────────────────

app.get('/api/widget/:widgetKey/config', async (req, res) => {
  try {
    const widget = await store.getWidgetByKey(req.params.widgetKey);
    if (!widget || !widget.is_active) {
      return res.status(404).json({ error: 'Widget not found' });
    }
    res.json({
      primaryColor: widget.primary_color,
      welcomeMessage: widget.welcome_message,
      botName: widget.bot_name,
      botAvatar: widget.bot_avatar_url,
      position: widget.position,
    });
  } catch (err) {
    logger.error({ err }, 'Error fetching widget config');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Public Message History ─────────────────────────────────────────────────

app.get('/api/widget/:widgetKey/history', async (req, res) => {
  try {
    const { widgetKey } = req.params;
    const { session } = req.query;
    if (!session) return res.status(400).json({ error: 'session query param required' });

    const messages = await store.getMessageHistory(widgetKey, session, 50);
    res.json({ messages });
  } catch (err) {
    logger.error({ err }, 'Error fetching history');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Send Message (called by Core-API) ─────────────────────────────────────

app.post('/api/send', (req, res) => {
  try {
    const { session_id, text, widget_key } = req.body;

    if (!session_id || !text) {
      return res.status(400).json({ error: 'session_id and text are required' });
    }

    // Stop typing indicator
    sessionManager.sendTyping(session_id, false);

    // Send message to visitor's browser
    const sent = sessionManager.sendToSession(session_id, {
      type: 'message',
      content: text,
      sender: 'bot',
      timestamp: Date.now(),
    });

    res.json({ success: true, delivered: sent });
  } catch (err) {
    logger.error({ err }, 'Error sending message');
    res.status(500).json({ error: err.message });
  }
});

// ─── Widget CRUD (internal, used by Core-API) ──────────────────────────────

app.get('/api/widgets', async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const widgets = tenantId
      ? await store.getWidgetsByTenant(tenantId)
      : [];
    res.json({ widgets });
  } catch (err) {
    logger.error({ err }, 'Error listing widgets');
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/widgets', async (req, res) => {
  try {
    const tenantId = req.body.tenant_id || getTenantId(req);
    if (!tenantId) return res.status(400).json({ error: 'tenant_id is required' });

    const widget = await store.createWidget({ tenant_id: tenantId, ...req.body });
    res.status(201).json({ widget });
  } catch (err) {
    logger.error({ err }, 'Error creating widget');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Widget already exists for this tenant' });
    }
    res.status(500).json({ error: 'Internal error' });
  }
});

app.put('/api/widgets/:widgetId', async (req, res) => {
  try {
    const widget = await store.updateWidget(req.params.widgetId, req.body);
    res.json({ widget });
  } catch (err) {
    logger.error({ err }, 'Error updating widget');
    res.status(500).json({ error: 'Internal error' });
  }
});

app.delete('/api/widgets/:widgetId', async (req, res) => {
  try {
    await store.deleteWidget(req.params.widgetId);
    res.json({ message: 'Widget removed' });
  } catch (err) {
    logger.error({ err }, 'Error deleting widget');
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/widgets/:widgetId/activate', async (req, res) => {
  try {
    const widget = await store.activateWidget(req.params.widgetId);
    res.json({ widget });
  } catch (err) {
    logger.error({ err }, 'Error activating widget');
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/widgets/:widgetId/deactivate', async (req, res) => {
  try {
    const widget = await store.deactivateWidget(req.params.widgetId);
    res.json({ widget });
  } catch (err) {
    logger.error({ err }, 'Error deactivating widget');
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── Start Server ───────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Webchat service started');
});

// Graceful shutdown
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info({ signal }, 'Shutting down...');
    io.close();
    httpServer.close();
    process.exit(0);
  });
}
