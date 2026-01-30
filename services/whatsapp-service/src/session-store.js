/**
 * Session Store
 * Manages WhatsApp session persistence in PostgreSQL
 */

import pg from 'pg';

export class SessionStore {
  constructor() {
    this.pool = null;
  }

  async connect() {
    this.pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Test connection
    const client = await this.pool.connect();
    console.log('✅ SessionStore connected to PostgreSQL');
    client.release();
  }

  async getByTenant(tenantId) {
    const result = await this.pool.query(
      `SELECT id, session_name, phone_number, status, last_connected_at, last_error, created_at
       FROM whatsapp_sessions
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows;
  }

  async get(sessionId) {
    const result = await this.pool.query(
      `SELECT * FROM whatsapp_sessions WHERE id = $1`,
      [sessionId]
    );
    return result.rows[0] || null;
  }

  async create(data) {
    const result = await this.pool.query(
      `INSERT INTO whatsapp_sessions (id, tenant_id, session_name, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.id, data.tenantId, data.sessionName, 'disconnected']
    );
    return result.rows[0];
  }

  async update(sessionId, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      const columnName = this.camelToSnake(key);
      fields.push(`${columnName} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(sessionId);

    await this.pool.query(
      `UPDATE whatsapp_sessions SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}`,
      values
    );
  }

  async updateStatus(sessionId, status, extra = {}) {
    await this.update(sessionId, { status, ...extra });
  }

  async setQrCode(sessionId, qrCode, expiresIn = 60) {
    await this.pool.query(
      `UPDATE whatsapp_sessions
       SET status = 'waiting_qr', qr_code = $1, qr_expires_at = NOW() + INTERVAL '${expiresIn} seconds', updated_at = NOW()
       WHERE id = $2`,
      [qrCode, sessionId]
    );
  }

  async markConnected(sessionId, phoneNumber) {
    await this.pool.query(
      `UPDATE whatsapp_sessions
       SET status = 'connected', phone_number = $1, qr_code = NULL, qr_expires_at = NULL,
           last_connected_at = NOW(), last_error = NULL, updated_at = NOW()
       WHERE id = $2`,
      [phoneNumber, sessionId]
    );
  }

  async markDisconnected(sessionId, error = null) {
    await this.pool.query(
      `UPDATE whatsapp_sessions
       SET status = 'disconnected', last_error = $1, updated_at = NOW()
       WHERE id = $2`,
      [error, sessionId]
    );
  }

  async delete(sessionId) {
    await this.pool.query(
      `DELETE FROM whatsapp_sessions WHERE id = $1`,
      [sessionId]
    );
  }

  camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}
