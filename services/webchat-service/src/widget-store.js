import pg from 'pg';
import pino from 'pino';
import crypto from 'crypto';

const logger = pino({ name: 'widget-store' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected pool error');
});

const PUBLIC_FIELDS = `id, tenant_id, widget_key, name, primary_color, welcome_message,
  bot_name, bot_avatar_url, position, is_active, allowed_domains, status, created_at, updated_at`;

export async function getWidgetByKey(widgetKey) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM webchat_widgets WHERE widget_key = $1`,
    [widgetKey]
  );
  return rows[0] || null;
}

export async function getWidgetsByTenant(tenantId) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM webchat_widgets WHERE tenant_id = $1 ORDER BY created_at`,
    [tenantId]
  );
  return rows;
}

export async function getWidget(widgetId) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM webchat_widgets WHERE id = $1`,
    [widgetId]
  );
  return rows[0] || null;
}

export async function createWidget(data) {
  const widgetKey = crypto.randomBytes(16).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO webchat_widgets (tenant_id, widget_key, name, primary_color, welcome_message, bot_name, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${PUBLIC_FIELDS}`,
    [
      data.tenant_id,
      widgetKey,
      data.name || 'Webchat',
      data.primary_color || '#6366f1',
      data.welcome_message || 'Olá! Como posso ajudar?',
      data.bot_name || 'Assistente IA',
      data.position || 'right',
    ]
  );
  return rows[0];
}

export async function updateWidget(widgetId, data) {
  const fields = [];
  const params = [widgetId];
  let idx = 2;

  for (const [key, value] of Object.entries(data)) {
    if (['name', 'primary_color', 'welcome_message', 'bot_name', 'bot_avatar_url', 'position', 'allowed_domains'].includes(key)) {
      fields.push(`${key} = $${idx}`);
      params.push(value);
      idx++;
    }
  }

  if (fields.length === 0) return getWidget(widgetId);

  fields.push('updated_at = NOW()');

  await pool.query(
    `UPDATE webchat_widgets SET ${fields.join(', ')} WHERE id = $1`,
    params
  );
  return getWidget(widgetId);
}

export async function deleteWidget(widgetId) {
  await pool.query('DELETE FROM webchat_widgets WHERE id = $1', [widgetId]);
}

export async function activateWidget(widgetId) {
  await pool.query(
    `UPDATE webchat_widgets SET is_active = true, status = 'active', updated_at = NOW() WHERE id = $1`,
    [widgetId]
  );
  return getWidget(widgetId);
}

export async function deactivateWidget(widgetId) {
  await pool.query(
    `UPDATE webchat_widgets SET is_active = false, status = 'inactive', updated_at = NOW() WHERE id = $1`,
    [widgetId]
  );
  return getWidget(widgetId);
}

export async function getMessageHistory(widgetKey, sessionId, limit = 50) {
  const widget = await getWidgetByKey(widgetKey);
  if (!widget) return [];

  const { rows } = await pool.query(
    `SELECT m.id, m.direction, m.sender_type, m.content, m.created_at
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.tenant_id = $1
       AND c.channel = 'webchat'
       AND c.channel_contact_id = $2
     ORDER BY m.created_at DESC
     LIMIT $3`,
    [widget.tenant_id, sessionId, limit]
  );
  return rows.reverse();
}

export default {
  getWidgetByKey, getWidgetsByTenant, getWidget, createWidget,
  updateWidget, deleteWidget, activateWidget, deactivateWidget,
  getMessageHistory,
};
