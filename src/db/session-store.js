'use strict';

/**
 * A minimal express-session store backed by better-sqlite3.
 * Replaces connect-sqlite3 (which depends on the `sqlite3` package and its
 * glibc-version-sensitive pre-built binaries).
 */

const { Store } = require('express-session');

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    sid        TEXT PRIMARY KEY,
    sess       TEXT NOT NULL,
    expired_at INTEGER NOT NULL
  )
`;
const CLEANUP_INTERVAL = 15 * 60 * 1000; // prune expired sessions every 15 min

class BetterSqliteStore extends Store {
  constructor(db) {
    super();
    this.db = db;
    db.exec(CREATE_TABLE);

    // Periodic cleanup of expired sessions
    const cleanup = () => db.prepare('DELETE FROM sessions WHERE expired_at <= ?').run(Date.now());
    cleanup();
    setInterval(cleanup, CLEANUP_INTERVAL).unref();
  }

  get(sid, cb) {
    try {
      const row = this.db.prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expired_at <= Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (err) { cb(err); }
  }

  set(sid, session, cb) {
    try {
      const maxAge    = session.cookie?.maxAge ?? 86_400_000;
      const expiredAt = Date.now() + maxAge;
      this.db.prepare(`
        INSERT INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at
      `).run(sid, JSON.stringify(session), expiredAt);
      cb(null);
    } catch (err) { cb(err); }
  }

  destroy(sid, cb) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (err) { cb(err); }
  }

  touch(sid, session, cb) {
    // Reset expiry without changing session data
    this.set(sid, session, cb);
  }
}

module.exports = BetterSqliteStore;
