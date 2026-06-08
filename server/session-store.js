function createPostgresSessionStore(session, { databaseConfigured, query, ttlMs }) {
  const Store = session.Store;
  let schemaReady = null;

  function expiresAtFromSession(sess) {
    const cookieExpires = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
    if (cookieExpires && !Number.isNaN(cookieExpires.getTime())) return cookieExpires;
    return new Date(Date.now() + ttlMs);
  }

  async function ensureSchema() {
    if (!databaseConfigured()) return false;
    if (!schemaReady) {
      schemaReady = query(`
        CREATE TABLE IF NOT EXISTS portal_sessions (
          sid TEXT PRIMARY KEY,
          sess_json JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS portal_sessions_expires_at_idx
          ON portal_sessions (expires_at);
      `).then(() => true);
    }
    return schemaReady;
  }

  return new (class PostgresSessionStore extends Store {
    get(sid, callback) {
      (async () => {
        if (!(await ensureSchema())) return null;
        const result = await query(
          "SELECT sess_json FROM portal_sessions WHERE sid = $1 AND expires_at > now()",
          [sid],
        );
        return result.rows[0]?.sess_json || null;
      })().then((sessionData) => callback(null, sessionData)).catch(callback);
    }

    set(sid, sess, callback) {
      (async () => {
        if (!(await ensureSchema())) return;
        await query(
          `INSERT INTO portal_sessions (sid, sess_json, expires_at, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (sid) DO UPDATE SET
             sess_json = EXCLUDED.sess_json,
             expires_at = EXCLUDED.expires_at,
             updated_at = now()`,
          [sid, sess, expiresAtFromSession(sess)],
        );
      })().then(() => callback(null)).catch(callback);
    }

    destroy(sid, callback) {
      (async () => {
        if (!(await ensureSchema())) return;
        await query("DELETE FROM portal_sessions WHERE sid = $1", [sid]);
      })().then(() => callback(null)).catch(callback);
    }

    touch(sid, sess, callback) {
      (async () => {
        if (!(await ensureSchema())) return;
        await query(
          "UPDATE portal_sessions SET expires_at = $2, updated_at = now() WHERE sid = $1",
          [sid, expiresAtFromSession(sess)],
        );
      })().then(() => callback(null)).catch(callback);
    }
  })();
}

module.exports = { createPostgresSessionStore };
