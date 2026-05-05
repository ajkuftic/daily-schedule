'use strict';

const path    = require('path');
const fs      = require('fs');
const express = require('express');
const db      = require('../db/index');
const { generateLink } = require('../services/storage/index');

const DATA_DIR        = process.env.DATA_DIR || path.join(__dirname, '../../data');
const NEWSLETTERS_DIR = path.join(DATA_DIR, 'newsletters');

const router = express.Router();

// ── Archive list ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const uploads = db.getPdfUploads();
  res.render('newsletters', { uploads, flash: req.query });
});

// ── Generate a fresh download link for a stored PDF ───────────
router.post('/:id/link', (req, res) => {
  try {
    const config  = db.getAllConfig();
    const uploads = db.getPdfUploads();
    const entry   = uploads.find(u => String(u.id) === String(req.params.id));

    if (!entry) {
      return res.status(404).json({ ok: false, error: 'Upload record not found' });
    }

    const url = generateLink(entry.filename, entry.provider, config, entry.drive_url);
    if (!url) {
      return res.status(400).json({ ok: false, error: 'Cannot generate link for this provider' });
    }
    res.json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Serve local PDFs ──────────────────────────────────────────
// Protected by requireAuth (applied in server.js before mounting this router).
// Only serves files from the newsletters directory to prevent path traversal.
router.get('/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // strip any directory components
  const filePath = path.join(NEWSLETTERS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.sendFile(filePath);
});

// ── Delete an upload record ───────────────────────────────────
router.post('/:id/delete', (req, res) => {
  db.deletePdfUpload(req.params.id);
  res.redirect('/newsletters?deleted=1');
});

module.exports = router;
