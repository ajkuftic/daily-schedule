'use strict';

const path = require('path');
const fs   = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'daily-schedule.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migrations — safe to run on every start (ALTER TABLE is a no-op if column exists)
try { db.exec('ALTER TABLE calendar_accounts ADD COLUMN blurbs_enabled INTEGER DEFAULT 1'); } catch {}


// ── CONFIG HELPERS ────────────────────────────────────────────
// Only JSON-parse values that are objects or arrays — leave plain strings as-is.
// This prevents '0'/'1' being parsed to numbers, which breaks strict === comparisons in templates.
function tryParseConfig(str) {
  if (typeof str === 'string' && (str.startsWith('{') || str.startsWith('['))) {
    try { return JSON.parse(str); } catch {}
  }
  return str;
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (!row) return undefined;
  return tryParseConfig(row.value);
}

function setConfig(key, value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  db.prepare(`
    INSERT INTO config (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, serialized);
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  return Object.fromEntries(rows.map(r => [r.key, tryParseConfig(r.value)]));
}

// ── CALENDAR ACCOUNT HELPERS ──────────────────────────────────
function getCalendarAccounts() {
  return db.prepare('SELECT * FROM calendar_accounts ORDER BY id').all().map(parseJsonFields);
}

function getCalendarAccount(id) {
  const row = db.prepare('SELECT * FROM calendar_accounts WHERE id = ?').get(id);
  return row ? parseJsonFields(row) : null;
}

function upsertCalendarAccount(data) {
  const { id, name, provider, is_reminder, blurbs_enabled, credentials, metadata } = data;
  if (id) {
    db.prepare(`
      UPDATE calendar_accounts
      SET name=?, provider=?, is_reminder=?, blurbs_enabled=?, credentials=?, metadata=?,
          updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name, provider, is_reminder ? 1 : 0, blurbs_enabled == null ? 1 : (blurbs_enabled ? 1 : 0),
      JSON.stringify(credentials), JSON.stringify(metadata), id);
    return id;
  }
  const result = db.prepare(`
    INSERT INTO calendar_accounts (name, provider, is_reminder, blurbs_enabled, credentials, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, provider, is_reminder ? 1 : 0, 1, JSON.stringify(credentials), JSON.stringify(metadata));
  return result.lastInsertRowid;
}

function setCalendarBlurbs(id, enabled) {
  db.prepare('UPDATE calendar_accounts SET blurbs_enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(enabled ? 1 : 0, id);
}

function deleteCalendarAccount(id) {
  db.prepare('DELETE FROM calendar_accounts WHERE id = ?').run(id);
}

// ── EMAIL ACCOUNT HELPERS ─────────────────────────────────────
function getEmailAccount() {
  const row = db.prepare('SELECT * FROM email_account ORDER BY id DESC LIMIT 1').get();
  return row ? parseJsonFields(row) : null;
}

function upsertEmailAccount(data) {
  const { provider, credentials } = data;
  // Replace entirely
  db.prepare('DELETE FROM email_account').run();
  db.prepare('INSERT INTO email_account (provider, credentials) VALUES (?, ?)').run(
    provider, JSON.stringify(credentials)
  );
}

function updateEmailCredentials(credentials) {
  db.prepare('UPDATE email_account SET credentials = ? WHERE id = (SELECT id FROM email_account ORDER BY id DESC LIMIT 1)').run(
    JSON.stringify(credentials)
  );
}

// ── SEND LOG HELPERS ──────────────────────────────────────────
function logSend(date, status, details) {
  db.prepare('INSERT INTO send_log (date, status, details) VALUES (?, ?, ?)').run(date, status, details || null);
}

function getRecentLogs(limit = 30) {
  return db.prepare('SELECT * FROM send_log ORDER BY sent_at DESC LIMIT ?').all(limit);
}

function getLogs({ page = 1, perPage = 50, status = null } = {}) {
  const offset = (page - 1) * perPage;
  const where  = status ? 'WHERE status = ?' : '';
  const args   = status ? [status, perPage, offset] : [perPage, offset];
  const rows   = db.prepare(`SELECT * FROM send_log ${where} ORDER BY sent_at DESC LIMIT ? OFFSET ?`).all(...args);
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM send_log ${where}`).get(...(status ? [status] : []));
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

function clearLogs() {
  db.prepare('DELETE FROM send_log').run();
}

// ── INTERNAL ──────────────────────────────────────────────────
function parseJsonFields(row) {
  const out = { ...row };
  for (const field of ['credentials', 'metadata']) {
    if (out[field]) {
      try { out[field] = JSON.parse(out[field]); } catch { /* leave as string */ }
    }
  }
  return out;
}

module.exports = {
  db,
  getConfig,
  setConfig,
  getAllConfig,
  getCalendarAccounts,
  getCalendarAccount,
  upsertCalendarAccount,
  setCalendarBlurbs,
  deleteCalendarAccount,
  getEmailAccount,
  upsertEmailAccount,
  updateEmailCredentials,
  logSend,
  getRecentLogs,
  getLogs,
  clearLogs,
};
