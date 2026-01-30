import pg from 'pg';
import pino from 'pino';

const logger = pino({ name: 'bot-store' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

export async function getAllBots() {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, bot_username, bot_name, status, is_active,
            last_connected_at, last_error, created_at, updated_at
     FROM telegram_bots WHERE is_active = true
     ORDER BY created_at`
  );
  return rows;
}

export async function getBotsByTenant(tenantId) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, bot_username, bot_name, status, is_active,
            last_connected_at, last_error, created_at, updated_at
     FROM telegram_bots WHERE tenant_id = $1 ORDER BY created_at`,
    [tenantId]
  );
  return rows;
}

export async function getBot(botId) {
  const { rows } = await pool.query(
    `SELECT * FROM telegram_bots WHERE id = $1`,
    [botId]
  );
  return rows[0] || null;
}

export async function createBot(data) {
  const { rows } = await pool.query(
    `INSERT INTO telegram_bots (tenant_id, bot_token_encrypted, bot_username, bot_name, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, tenant_id, bot_username, bot_name, status, is_active, created_at, updated_at`,
    [data.tenant_id, data.bot_token_encrypted, data.bot_username, data.bot_name, data.status || 'disconnected']
  );
  return rows[0];
}

export async function updateBotStatus(botId, status, error = null) {
  const fields = ['status = $2', 'updated_at = NOW()'];
  const params = [botId, status];

  if (status === 'connected') {
    fields.push('last_connected_at = NOW()');
    fields.push('last_error = NULL');
  }
  if (error) {
    fields.push(`last_error = $${params.length + 1}`);
    params.push(error);
  }

  await pool.query(
    `UPDATE telegram_bots SET ${fields.join(', ')} WHERE id = $1`,
    params
  );
}

export async function deleteBot(botId) {
  await pool.query('DELETE FROM telegram_bots WHERE id = $1', [botId]);
}

export async function getBotToken(botId) {
  const { rows } = await pool.query(
    'SELECT bot_token_encrypted FROM telegram_bots WHERE id = $1',
    [botId]
  );
  return rows[0]?.bot_token_encrypted || null;
}

export default { getAllBots, getBotsByTenant, getBot, createBot, updateBotStatus, deleteBot, getBotToken };
