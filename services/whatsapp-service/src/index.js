/**
 * AiYou Assist - WhatsApp Service
 *
 * Direct Baileys integration for WhatsApp connectivity.
 * Manages multi-tenant WhatsApp sessions via REST API.
 */

import express from 'express';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { BaileysManager } from './baileys-manager.js';
import { SessionStore } from './session-store.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8002;

// Initialize services
const sessionStore = new SessionStore();
const gateway = new BaileysManager(sessionStore);

// Logger
const logger = pinoHttp({
  level: process.env.LOG_LEVEL || 'info',
});

app.use(logger);
app.use(express.json());

// Correlation ID
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.tenantId = req.headers['x-tenant-id'];
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

// =============================================================================
// Health & Status
// =============================================================================

app.get('/health', async (req, res) => {
  const healthy = gateway.healthCheck();
  res.json({
    status: healthy ? 'healthy' : 'degraded',
    service: 'whatsapp-service',
    engine: 'baileys-direct',
    active_sessions: gateway.sockets.size,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/status', async (req, res) => {
  try {
    const status = gateway.getStatus();
    res.json(status);
  } catch (err) {
    res.json({ error: err.message });
  }
});

app.get('/metrics', async (req, res) => {
  const metrics = gateway.getMetrics();
  res.json(metrics);
});

// =============================================================================
// Session Management
// =============================================================================

// List sessions for tenant
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await sessionStore.getByTenant(req.tenantId);

    // Enrich with live socket status
    for (const s of sessions) {
      const entry = gateway.sockets.get(s.id);
      if (entry) {
        s.live_status = entry.sock?.user ? 'connected' : 'connecting';
        s.live_phone = entry.sock?.user?.id?.split(':')[0] || null;
      }
    }

    res.json({ sessions });
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Create session
app.post('/api/sessions', async (req, res) => {
  const { session_id, tenant_id, session_name } = req.body;

  try {
    const session = await sessionStore.create({
      id: session_id || uuidv4(),
      tenantId: tenant_id || req.tenantId,
      sessionName: session_name,
    });

    res.json({
      session_id: session.id,
      status: session.status,
    });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get session status
app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const session = await sessionStore.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete session
app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    await gateway.stopSession(req.params.sessionId);
    await sessionStore.delete(req.params.sessionId);
    res.json({ message: 'Session deleted' });
  } catch (err) {
    console.error('Error deleting session:', err);
    res.status(500).json({ error: err.message });
  }
});

// Request QR code — starts Baileys session which generates QR
app.post('/api/sessions/:sessionId/qr', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    console.log(`QR requested for session: ${sessionId}`);

    // Update session status to waiting_qr
    await sessionStore.updateStatus(sessionId, 'waiting_qr');

    // Start Baileys session — QR will arrive via connection.update event
    await gateway.startSession(sessionId);

    // Wait briefly for QR to arrive
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Return current state
    const session = await sessionStore.get(sessionId);

    res.json({
      message: 'QR code requested',
      status: session?.status || 'waiting_qr',
      qr_code: session?.qr_code || null,
      qr_expires_at: session?.qr_expires_at || null,
    });
  } catch (err) {
    console.error('Error requesting QR:', err);
    res.status(500).json({ error: err.message });
  }
});

// Disconnect session
app.post('/api/sessions/:sessionId/disconnect', async (req, res) => {
  try {
    await gateway.stopSession(req.params.sessionId);
    await sessionStore.markDisconnected(req.params.sessionId);
    res.json({ message: 'Session disconnected' });
  } catch (err) {
    console.error('Error disconnecting session:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// Channel / Gateway Endpoints (backward compatible)
// =============================================================================

// Get channels status
app.get('/api/channels/status', async (req, res) => {
  res.json(gateway.getChannelsStatus());
});

// Get config
app.get('/api/config', async (req, res) => {
  res.json(gateway.getConfig());
});

// Patch config (no-op for Baileys direct)
app.post('/api/config/patch', async (req, res) => {
  res.json({ message: 'Config updated', config: gateway.getConfig() });
});

// Send message
app.post('/api/send', async (req, res) => {
  const { to, content, message, type, session_id, media_url, caption } = req.body;

  try {
    let sessionId = session_id;

    // If no session_id, find first connected session for the tenant
    if (!sessionId && req.tenantId) {
      const sessions = await sessionStore.getByTenant(req.tenantId);
      const connected = sessions.find(s => s.status === 'connected');
      sessionId = connected?.id;
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'No session_id provided and no connected session found' });
    }

    const result = await gateway.sendMessage({
      to,
      message: message || content,
      type: type || 'text',
      sessionId,
      mediaUrl: media_url,
      caption,
    });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Login — requires session_id
app.post('/api/channels/login', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required' });
  }
  try {
    await gateway.startSession(session_id);
    res.json({ message: 'Login initiated', session_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout — requires session_id
app.post('/api/channels/logout', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required' });
  }
  try {
    await gateway.stopSession(session_id);
    await sessionStore.markDisconnected(session_id);
    res.json({ message: 'Logout completed', session_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List active Baileys sessions
app.get('/api/gateway/sessions', async (req, res) => {
  res.json({ sessions: gateway.listSessions() });
});

// Reset a session
app.post('/api/gateway/sessions/reset', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: 'session_id is required' });
  }
  try {
    await gateway.resetSession(session_id);
    res.json({ message: 'Session reset', session_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Gateway info (diagnostics)
app.get('/api/gateway/info', async (req, res) => {
  res.json({
    engine: 'baileys-direct',
    ready: gateway.isReady(),
    status: gateway.getStatus(),
    channels: gateway.getChannelsStatus(),
    config: gateway.getConfig(),
    metrics: gateway.getMetrics(),
  });
});

// =============================================================================
// Core-API Notifications
// =============================================================================

const CORE_API_URL = process.env.CORE_API_URL || 'http://core-api:8000';
const CORE_API_INTERNAL_KEY = process.env.CORE_API_INTERNAL_KEY || '';

async function notifyCoreApi(event, sessionId, data = {}) {
  try {
    const url = `${CORE_API_URL}/api/webhooks/whatsapp-service`;
    const payload = { event, session_id: sessionId, ...data };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': CORE_API_INTERNAL_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.warn(`Core-API notification failed (${res.status}):`, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.warn('Failed to notify core-api:', err.message);
  }
}

// =============================================================================
// Start Server
// =============================================================================

app.listen(PORT, async () => {
  console.log(`WhatsApp Service running on port ${PORT} (Baileys direct)`);

  // Connect to database
  await sessionStore.connect();
  console.log('Connected to database');

  // Initialize Baileys manager (restores previously connected sessions)
  try {
    await gateway.connect();
    console.log('Baileys manager initialized');
  } catch (err) {
    console.error('Baileys manager init error (non-fatal):', err.message);
  }

  // Listen for session events and notify core-api
  gateway.on('session-connected', async (payload) => {
    console.log(`Session connected: ${payload.sessionId} (${payload.phoneNumber})`);
    notifyCoreApi('session.connected', payload.sessionId, {
      phone_number: payload.phoneNumber || '',
    });
  });

  gateway.on('session-disconnected', async (payload) => {
    console.log(`Session disconnected: ${payload.sessionId} (${payload.reason})`);
    notifyCoreApi('session.disconnected', payload.sessionId, {
      reason: payload.reason || null,
    });
  });

  gateway.on('session-qr', async (payload) => {
    console.log(`QR code generated for session: ${payload.sessionId}`);
    notifyCoreApi('session.qr_updated', payload.sessionId, {
      qr_code: payload.qrCode,
    });
  });

  gateway.on('message-received', async (payload) => {
    console.log(`Message from ${payload.from} on session ${payload.sessionId}`);
    notifyCoreApi('message.received', payload.sessionId, {
      from: payload.from,
      push_name: payload.push_name,
      content: payload.text,
      body: payload.text,
      type: payload.type,
      message_id: payload.message_id,
      timestamp: payload.timestamp,
    });
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await gateway.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await gateway.shutdown();
  process.exit(0);
});
