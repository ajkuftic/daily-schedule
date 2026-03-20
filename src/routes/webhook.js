'use strict';

const express = require('express');
const db      = require('../db/index');
const { sendDailyNewsletter } = require('../services/newsletter');

const router = express.Router();

/**
 * POST /webhook/:secret
 * Trigger an immediate newsletter send if the secret matches.
 * Designed to be called by automations (Home Assistant, Zapier, Make, etc.)
 */
router.post('/:secret', async (req, res) => {
  const stored = db.getConfig('webhook_secret');
  if (!stored || req.params.secret !== stored) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  const config = db.getAllConfig();
  if (!config.setup_complete) {
    return res.status(400).json({ error: 'Setup not complete' });
  }

  // Respond immediately — send runs async
  res.json({ ok: true, message: 'Newsletter send triggered' });

  sendDailyNewsletter(config).catch(err => {
    console.error('[webhook] Send error:', err.message);
    db.logSend(new Date().toISOString().substring(0, 10), 'error', `[webhook] ${err.message}`);
  });
});

module.exports = router;
