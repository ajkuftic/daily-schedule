'use strict';

/**
 * Local filesystem storage provider.
 * Saves PDFs to <DATA_DIR>/newsletters/ and keeps the last N files.
 *
 * Required config keys: (none — uses DATA_DIR env var or default)
 * Optional config keys:
 *   storage_local_keep   Number of past PDFs to retain (default: 30)
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR       = process.env.DATA_DIR || path.join(__dirname, '../../../../data');
const NEWSLETTERS_DIR = path.join(DATA_DIR, 'newsletters');

async function upload(buffer, filename, config) {
  fs.mkdirSync(NEWSLETTERS_DIR, { recursive: true });

  const filePath = path.join(NEWSLETTERS_DIR, filename);
  fs.writeFileSync(filePath, buffer);

  // Prune old files — keep the most recent N
  const keep = parseInt(config.storage_local_keep || '30', 10);
  const files = fs.readdirSync(NEWSLETTERS_DIR)
    .filter(f => f.endsWith('.pdf'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(NEWSLETTERS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const old of files.slice(keep)) {
    try { fs.unlinkSync(path.join(NEWSLETTERS_DIR, old.name)); } catch {}
  }

  return { path: filePath };
}

function isConfigured(config) {
  return config.storage_provider === 'local';
}

module.exports = { upload, isConfigured };
