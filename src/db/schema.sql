-- Key-value store for all app configuration
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Calendar accounts (one row per connected calendar source)
CREATE TABLE IF NOT EXISTS calendar_accounts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,           -- user-friendly label, e.g. "Family"
  provider       TEXT NOT NULL,           -- 'google' | 'caldav' | 'outlook' | 'ics'
  is_reminder    INTEGER DEFAULT 0,       -- 1 = fixed-time reminders (never shift tz)
  blurbs_enabled INTEGER DEFAULT 1,       -- 0 = skip AI blurbs for this calendar
  credentials    TEXT,                    -- JSON: OAuth tokens or DAV credentials
  metadata       TEXT,                    -- JSON: calendar IDs to include, etc.
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email account (at most one active sender)
CREATE TABLE IF NOT EXISTS email_account (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  provider     TEXT NOT NULL,           -- 'gmail' | 'smtp'
  credentials  TEXT,                    -- JSON: OAuth tokens or SMTP config
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Delivery log
CREATE TABLE IF NOT EXISTS send_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  date     TEXT NOT NULL,              -- ISO date of the newsletter, e.g. "2025-06-15"
  status   TEXT NOT NULL,             -- 'success' | 'error'
  details  TEXT,
  sent_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
