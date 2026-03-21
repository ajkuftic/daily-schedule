'use strict';

/**
 * Intercepts console.log/warn/error and appends timestamped lines to
 * DATA_DIR/app.log (alongside the SQLite DB).  Rotates at 5 MB.
 *
 * Import once at the very top of server.js — all subsequent console
 * calls in any module will be captured.
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const LOG_PATH = path.join(DATA_DIR, 'app.log');
const MAX_BYTES = 5 * 1024 * 1024; // rotate at 5 MB

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function serialize(args) {
  return args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

function appendLine(level, text) {
  const line = `${new Date().toISOString()} [${level}] ${text}\n`;
  try {
    // Simple size-based rotation: rename current → .1 when over limit
    try {
      if (fs.statSync(LOG_PATH).size > MAX_BYTES) {
        fs.renameSync(LOG_PATH, LOG_PATH + '.1');
      }
    } catch { /* file doesn't exist yet */ }
    fs.appendFileSync(LOG_PATH, line);
  } catch { /* never throw from logger */ }
}

// ── Patch console ─────────────────────────────────────────────────────────────
// Capture original references before replacing so we don't recurse.
const _log   = console.log.bind(console);
const _warn  = console.warn.bind(console);
const _error = console.error.bind(console);

console.log   = (...args) => { _log(...args);   appendLine('INFO',  serialize(args)); };
console.warn  = (...args) => { _warn(...args);  appendLine('WARN',  serialize(args)); };
console.error = (...args) => { _error(...args); appendLine('ERROR', serialize(args)); };

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Read the last `lines` lines from the log file (both current + rotated).
 * Returns an array of parsed objects: { ts, level, message }.
 */
function readLogTail(lines = 500) {
  let raw = '';
  // Prepend older rotated file if it exists
  try { raw += fs.readFileSync(LOG_PATH + '.1', 'utf8'); } catch { /* no rotation yet */ }
  try { raw += fs.readFileSync(LOG_PATH,        'utf8'); } catch { return []; }

  return raw
    .trimEnd()
    .split('\n')
    .slice(-lines)
    .map(line => {
      const m = line.match(/^(\S+) \[(INFO|WARN|ERROR)\] ([\s\S]*)$/);
      if (!m) return { ts: '', level: 'INFO', message: line };
      return { ts: m[1], level: m[2], message: m[3] };
    });
}

module.exports = { readLogTail, LOG_PATH };
