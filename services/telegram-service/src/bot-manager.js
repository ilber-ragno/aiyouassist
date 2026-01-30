import TelegramBot from 'node-telegram-bot-api';
import { EventEmitter } from 'events';
import pino from 'pino';
import store from './bot-store.js';

const logger = pino({ name: 'bot-manager' });

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bots = new Map(); // botId -> { bot, botId, tenantId, username }
  }

  async initialize() {
    logger.info('Initializing bot manager, restoring active bots...');
    try {
      const activeBots = await store.getAllBots();
      let restored = 0;
      for (const botRecord of activeBots) {
        if (botRecord.status === 'connected') {
          try {
            await this.startBot(botRecord.id);
            restored++;
          } catch (err) {
            logger.error({ botId: botRecord.id, err: err.message }, 'Failed to restore bot');
            await store.updateBotStatus(botRecord.id, 'error', err.message);
          }
        }
      }
      logger.info({ total: activeBots.length, restored }, 'Bot manager initialized');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize bot manager');
    }
  }

  async startBot(botId) {
    if (this.bots.has(botId)) {
      logger.info({ botId }, 'Bot already running');
      return this.bots.get(botId);
    }

    const token = await store.getBotToken(botId);
    if (!token) throw new Error('Bot token not found');

    const botRecord = await store.getBot(botId);
    if (!botRecord) throw new Error('Bot record not found');

    logger.info({ botId, username: botRecord.bot_username }, 'Starting bot...');

    const bot = new TelegramBot(token, { polling: true });

    const entry = {
      bot,
      botId,
      tenantId: botRecord.tenant_id,
      username: botRecord.bot_username,
    };

    // Handle incoming messages
    bot.on('message', (msg) => {
      if (!msg.text) return; // Skip non-text for now

      const payload = {
        botId,
        tenantId: botRecord.tenant_id,
        chatId: String(msg.chat.id),
        from: {
          id: String(msg.from.id),
          firstName: msg.from.first_name || '',
          lastName: msg.from.last_name || '',
          username: msg.from.username || '',
        },
        text: msg.text,
        messageId: String(msg.message_id),
        timestamp: msg.date,
      };

      logger.info({ botId, chatId: payload.chatId, text: payload.text?.substring(0, 50) }, 'Message received');
      this.emit('message', payload);
    });

    bot.on('polling_error', (err) => {
      logger.error({ botId, err: err.message }, 'Polling error');

      // If 401/409 error, the token is invalid or another instance is polling
      if (err.response?.statusCode === 401 || err.response?.statusCode === 409) {
        this.stopBot(botId).catch(() => {});
        store.updateBotStatus(botId, 'error', `Polling error: ${err.message}`);
        this.emit('bot-error', { botId, tenantId: botRecord.tenant_id, error: err.message });
      }
    });

    this.bots.set(botId, entry);
    await store.updateBotStatus(botId, 'connected');

    logger.info({ botId, username: botRecord.bot_username }, 'Bot started successfully');
    this.emit('bot-connected', { botId, tenantId: botRecord.tenant_id, username: botRecord.bot_username });

    return entry;
  }

  async stopBot(botId) {
    const entry = this.bots.get(botId);
    if (!entry) return;

    logger.info({ botId }, 'Stopping bot...');
    try {
      await entry.bot.stopPolling();
    } catch (err) {
      logger.warn({ botId, err: err.message }, 'Error stopping polling');
    }

    this.bots.delete(botId);
    await store.updateBotStatus(botId, 'disconnected');

    this.emit('bot-disconnected', { botId, tenantId: entry.tenantId });
    logger.info({ botId }, 'Bot stopped');
  }

  async sendMessage(botId, chatId, text, options = {}) {
    const entry = this.bots.get(botId);
    if (!entry) {
      // Try to find an active bot for the same tenant (fallback)
      const token = await store.getBotToken(botId);
      if (!token) throw new Error('Bot not found or not running');

      // One-shot send without polling
      const tempBot = new TelegramBot(token, { polling: false });
      const result = await tempBot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
      return result;
    }

    const result = await entry.bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
    return result;
  }

  async testToken(token) {
    const bot = new TelegramBot(token, { polling: false });
    const me = await bot.getMe();
    return me;
  }

  getStatus(botId) {
    return this.bots.has(botId) ? 'connected' : 'disconnected';
  }

  listActiveBots() {
    return Array.from(this.bots.values()).map(e => ({
      botId: e.botId,
      tenantId: e.tenantId,
      username: e.username,
    }));
  }

  async shutdown() {
    logger.info('Shutting down all bots...');
    const promises = [];
    for (const [botId] of this.bots) {
      promises.push(this.stopBot(botId));
    }
    await Promise.allSettled(promises);
    logger.info('All bots shut down');
  }
}

export default new BotManager();
