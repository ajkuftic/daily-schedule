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

// ── CONFIG HELPERS ────────────────────────────────────────────
function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (!row) return undefined;
  try { return JSON.parse(row.value); } catch { return row.value; }
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
  return Object.fromEntries(rows.map(r => {
    try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, r.value]; }
  }));
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
  const { id, name, provider, is_reminder, credentials, metadata } = data;
  if (id) {
    db.prepare(`
      UPDATE calendar_accounts
      SET name=?, provider=?, is_reminder=?, credentials=?, metadata=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(name, provider, is_reminder ? 1 : 0, JSON.stringify(credentials), JSON.stringify(metadata), id);
    return id;
  }
  const result = db.prepare(`
    INSERT INTO calendar_accounts (name, provider, is_reminder, credentials, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, provider, is_reminder ? 1 : 0, JSON.stringify(credentials), JSON.stringify(metadata));
  return result.lastInsertRowid;
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
  deleteCalendarAccount,
  getEmailAccount,
  upsertEmailAccount,
  updateEmailCredentials,
  logSend,
  getRecentLogs,
};
