import { EventEmitter } from 'events';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  isJidGroup,
  isJidStatusBroadcast,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import { usePgAuthState } from './pg-auth-state.js';

/**
 * Manages multiple concurrent Baileys WhatsApp sessions.
 * Drop-in replacement for ClaudBotManager — emits the same events.
 */
export class BaileysManager extends EventEmitter {
  constructor(sessionStore) {
    super();
    this.sessionStore = sessionStore;
    /** @type {Map<string, { sock: any, cleanup: () => void }>} */
    this.sockets = new Map();
    /** @type {Map<string, NodeJS.Timeout>} */
    this.reconnectTimers = new Map();
    this.pool = null;
    this.encryptionKey = process.env.SESSION_ENCRYPTION_KEY || '';
    this.logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
    this._baileysVersion = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Initialize and restore previously connected sessions.
   */
  async connect() {
    this.pool = this.sessionStore.pool;

    try {
      const { version } = await fetchLatestBaileysVersion();
      this._baileysVersion = version;
      this.logger.info({ version }, 'Baileys version fetched');
    } catch {
      this._baileysVersion = [2, 3000, 1015901307];
      this.logger.warn('Could not fetch Baileys version, using fallback');
    }

    // Restore sessions that were previously connected
    const { rows } = await this.pool.query(
      `SELECT id FROM whatsapp_sessions
       WHERE status IN ('connected', 'reconnecting')
         AND session_data_encrypted IS NOT NULL`,
    );

    for (const row of rows) {
      try {
        await this.startSession(row.id);
        this.logger.info({ sessionId: row.id }, 'Restored session');
        // Delay between restores to avoid WhatsApp rate limits
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        this.logger.error({ sessionId: row.id, err: err.message }, 'Failed to restore session');
        await this.sessionStore.updateStatus(row.id, 'error', err.message);
      }
    }
  }

  /**
   * Graceful shutdown — disconnect all sessions.
   */
  async shutdown() {
    for (const [sessionId] of this.sockets) {
      await this.stopSession(sessionId, false);
    }
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
  }

  // ── Session Management ──────────────────────────────────────────────

  /**
   * Start a Baileys socket for the given session. Generates QR if no auth state exists.
   */
  async startSession(sessionId) {
    // Prevent duplicate sockets
    if (this.sockets.has(sessionId)) {
      await this._closeSocket(sessionId);
    }

    // Cancel any pending reconnect
    const timer = this.reconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionId);
    }

    const { state, saveCreds } = await usePgAuthState(
      this.pool,
      sessionId,
      this.encryptionKey,
    );

    const sock = makeWASocket({
      version: this._baileysVersion,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      printQRInTerminal: false,
      logger: this.logger,
      browser: ['AiYou Assist', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
    });

    this._bindEvents(sessionId, sock, saveCreds);
    this.sockets.set(sessionId, { sock, saveCreds });
  }

  /**
   * Stop and optionally logout a session.
   */
  async stopSession(sessionId, doLogout = true) {
    const timer = this.reconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(sessionId);
    }

    const entry = this.sockets.get(sessionId);
    if (entry) {
      entry.sock.ev.removeAllListeners();
      if (doLogout) {
        try { await entry.sock.logout(); } catch { /* ignore */ }
      }
      try { entry.sock.end(undefined); } catch { /* ignore */ }
      this.sockets.delete(sessionId);
    }
  }

  /**
   * Reset a session — clear auth state and stop socket.
   */
  async resetSession(sessionId) {
    await this.stopSession(sessionId, true);
    // Clear encrypted auth data
    await this.pool.query(
      'UPDATE whatsapp_sessions SET session_data_encrypted = NULL, updated_at = NOW() WHERE id = $1',
      [sessionId],
    );
    await this.sessionStore.markDisconnected(sessionId);
  }

  // ── Messaging ───────────────────────────────────────────────────────

  /**
   * Send a message through a specific session.
   */
  async sendMessage({ to, message, type = 'text', sessionId, mediaUrl, caption }) {
    const entry = this.sockets.get(sessionId);
    if (!entry) {
      throw new Error(`Session ${sessionId} not connected`);
    }

    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    let content;

    switch (type) {
      case 'text':
        content = { text: message };
        break;
      case 'image':
        content = { image: { url: mediaUrl || message }, caption: caption || '' };
        break;
      case 'video':
        content = { video: { url: mediaUrl || message }, caption: caption || '' };
        break;
      case 'audio':
        content = { audio: { url: mediaUrl || message }, mimetype: 'audio/ogg; codecs=opus', ptt: true };
        break;
      case 'document':
        content = { document: { url: mediaUrl || message }, mimetype: 'application/octet-stream', fileName: caption || 'document' };
        break;
      default:
        content = { text: message };
    }

    const result = await entry.sock.sendMessage(jid, content);
    return {
      messageId: result?.key?.id || null,
      status: 'sent',
    };
  }

  // ── Status & Health ─────────────────────────────────────────────────

  healthCheck() {
    return true;
  }

  isReady() {
    return true;
  }

  getStatus() {
    const sessions = [];
    for (const [id, entry] of this.sockets) {
      sessions.push({
        id,
        connected: !!entry.sock?.user,
        phone: entry.sock?.user?.id?.split(':')[0] || null,
      });
    }
    return {
      ready: true,
      gateway_connected: true,
      active_sessions: this.sockets.size,
      connected_sessions: sessions.filter(s => s.connected).length,
      sessions,
    };
  }

  listSessions() {
    const list = [];
    for (const [id, entry] of this.sockets) {
      list.push({
        id,
        status: entry.sock?.user ? 'connected' : 'connecting',
        phone_number: entry.sock?.user?.id?.split(':')[0] || null,
      });
    }
    return list;
  }

  getChannelsStatus() {
    return {
      whatsapp: {
        connected: [...this.sockets.values()].filter(e => !!e.sock?.user).length,
        total: this.sockets.size,
      },
    };
  }

  getConfig() {
    return {
      engine: 'baileys-direct',
      version: this._baileysVersion,
      max_sessions: 10,
    };
  }

  getMetrics() {
    return {
      active_sockets: this.sockets.size,
      reconnect_pending: this.reconnectTimers.size,
    };
  }

  // ── Internal: Event Binding ─────────────────────────────────────────

  _bindEvents(sessionId, sock, saveCreds) {
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR code generated
      if (qr) {
        try {
          const qrDataUri = await QRCode.toDataURL(qr);
          await this.sessionStore.setQrCode(sessionId, qrDataUri, 60);
          this.emit('session-qr', { sessionId, qrCode: qrDataUri });
        } catch (err) {
          this.logger.error({ sessionId, err: err.message }, 'QR generation failed');
        }
      }

      // Connection closed
      if (connection === 'close') {
        this.sockets.delete(sessionId);

        const boom = lastDisconnect?.error;
        const statusCode = boom instanceof Boom
          ? boom.output.statusCode
          : boom?.output?.statusCode;
        const reason = boom?.message || 'unknown';

        if (statusCode === DisconnectReason.loggedOut) {
          // User logged out — clear auth
          await this.sessionStore.markDisconnected(sessionId);
          await this.pool.query(
            'UPDATE whatsapp_sessions SET session_data_encrypted = NULL WHERE id = $1',
            [sessionId],
          );
          this.emit('session-disconnected', { sessionId, reason: 'logged_out' });
        } else if (statusCode === DisconnectReason.restartRequired) {
          // Restart required — reconnect immediately
          this.logger.info({ sessionId }, 'Restart required, reconnecting...');
          this._scheduleReconnect(sessionId, 1000);
        } else {
          // Other disconnection — attempt reconnect
          await this.sessionStore.updateStatus(sessionId, 'reconnecting');
          this.emit('session-disconnected', { sessionId, reason });
          this._scheduleReconnect(sessionId);
        }
      }

      // Connected
      if (connection === 'open') {
        const phoneNumber = sock.user?.id?.split(':')[0] || '';
        await this.sessionStore.markConnected(sessionId, phoneNumber);
        this.emit('session-connected', { sessionId, phoneNumber });
      }
    });

    // Credential updates
    sock.ev.on('creds.update', saveCreds);

    // Incoming messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;
        if (isJidBroadcast(msg.key.remoteJid)) continue;
        if (isJidStatusBroadcast(msg.key.remoteJid)) continue;

        const senderJid = msg.key.remoteJid;
        const senderPhone = senderJid.split('@')[0];
        const pushName = msg.pushName || '';
        const msgContent = msg.message;

        const text =
          msgContent.conversation ||
          msgContent.extendedTextMessage?.text ||
          msgContent.imageMessage?.caption ||
          msgContent.videoMessage?.caption ||
          msgContent.documentMessage?.caption ||
          '';

        const msgType = this._getMessageType(msgContent);

        this.emit('message-received', {
          sessionId,
          from: senderPhone,
          fromJid: senderJid,
          push_name: pushName,
          text,
          content: text,
          body: text,
          type: msgType,
          timestamp: msg.messageTimestamp,
          message_id: msg.key.id,
          isGroup: isJidGroup(senderJid),
          rawMessage: msg,
        });
      }
    });
  }

  // ── Internal: Reconnection ──────────────────────────────────────────

  _scheduleReconnect(sessionId, delay = 3000) {
    if (this.reconnectTimers.has(sessionId)) return;

    const MAX_DELAY = 60000;
    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(sessionId);
      try {
        await this.startSession(sessionId);
        this.logger.info({ sessionId }, 'Reconnected successfully');
      } catch (err) {
        this.logger.error({ sessionId, err: err.message }, 'Reconnect failed');
        this._scheduleReconnect(sessionId, Math.min(delay * 2, MAX_DELAY));
      }
    }, delay);

    this.reconnectTimers.set(sessionId, timer);
  }

  async _closeSocket(sessionId) {
    const entry = this.sockets.get(sessionId);
    if (entry) {
      entry.sock.ev.removeAllListeners();
      try { entry.sock.end(undefined); } catch { /* ignore */ }
      this.sockets.delete(sessionId);
    }
  }

  _getMessageType(msgContent) {
    if (msgContent.imageMessage) return 'image';
    if (msgContent.videoMessage) return 'video';
    if (msgContent.audioMessage) return 'audio';
    if (msgContent.documentMessage) return 'document';
    if (msgContent.stickerMessage) return 'sticker';
    if (msgContent.locationMessage) return 'location';
    if (msgContent.contactMessage) return 'contact';
    return 'text';
  }
}
