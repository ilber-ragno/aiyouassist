import crypto from 'crypto';
import { proto } from '@whiskeysockets/baileys';
import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

/**
 * PostgreSQL-backed auth state for Baileys.
 * Stores encrypted auth data in whatsapp_sessions.session_data_encrypted.
 *
 * @param {import('pg').Pool} pool
 * @param {string} sessionId
 * @param {string} encryptionKey - base64-encoded 32-byte key
 */
export async function usePgAuthState(pool, sessionId, encryptionKey) {
  const KEY = Buffer.from(encryptionKey, 'base64');
  if (KEY.length !== 32) {
    throw new Error('SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }

  // ── Encryption helpers ──────────────────────────────────────────────
  function encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]); // 12 + 16 + N
  }

  function decrypt(buf) {
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc, undefined, 'utf8') + decipher.final('utf8');
  }

  // ── Load existing state from DB ─────────────────────────────────────
  let creds;
  let keys = {};

  try {
    const { rows } = await pool.query(
      'SELECT session_data_encrypted FROM whatsapp_sessions WHERE id = $1',
      [sessionId],
    );

    if (rows[0]?.session_data_encrypted) {
      const json = decrypt(rows[0].session_data_encrypted);
      const parsed = JSON.parse(json, BufferJSON.reviver);
      creds = parsed.creds;
      keys = parsed.keys || {};
    }
  } catch (err) {
    // Corrupted data or wrong key — start fresh
    console.warn(`[pg-auth-state] Failed to load state for ${sessionId}, starting fresh:`, err.message);
    creds = undefined;
    keys = {};
  }

  if (!creds) {
    creds = initAuthCreds();
  }

  // ── Debounced save ──────────────────────────────────────────────────
  let saveTimer = null;

  async function _doSave() {
    const json = JSON.stringify({ creds, keys }, BufferJSON.replacer);
    const encrypted = encrypt(json);
    await pool.query(
      'UPDATE whatsapp_sessions SET session_data_encrypted = $1, updated_at = NOW() WHERE id = $2',
      [encrypted, sessionId],
    );
  }

  function saveCreds() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      _doSave().catch(err =>
        console.error(`[pg-auth-state] Save failed for ${sessionId}:`, err.message),
      );
    }, 500);
  }

  // ── Keys interface (required by Baileys) ────────────────────────────
  const keyStore = {
    get(type, ids) {
      const result = {};
      for (const id of ids) {
        const k = `${type}:${id}`;
        let value = keys[k];
        if (value && type === 'app-state-sync-key') {
          value = proto.Message.AppStateSyncKeyData.fromObject(value);
        }
        result[id] = value || null;
      }
      return result;
    },

    set(data) {
      for (const [type, entries] of Object.entries(data)) {
        for (const [id, value] of Object.entries(entries)) {
          const k = `${type}:${id}`;
          if (value) {
            keys[k] = value;
          } else {
            delete keys[k];
          }
        }
      }
      saveCreds();
    },
  };

  return {
    state: { creds, keys: keyStore },
    saveCreds,
  };
}
