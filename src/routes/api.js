'use strict';

const express = require('express');
const db      = require('../db/index');
const { sendDailyNewsletter, buildNewsletterContent } = require('../services/newsletter');
const { reschedule }          = require('../scheduler');

const router = express.Router();

// POST /api/send-now — trigger newsletter immediately
router.post('/send-now', async (req, res) => {
  try {
    const config = db.getAllConfig();
    if (!config.setup_complete) {
      return res.status(400).json({ error: 'Setup not complete' });
    }
    // Run async, respond immediately
    sendDailyNewsletter(config).catch(err => {
      console.error('[api] send-now error:', err.message);
      db.logSend(new Date().toISOString().substring(0, 10), 'error', err.message);
    });
    res.json({ ok: true, message: 'Newsletter send started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/status — recent send log + config summary
router.get('/status', (req, res) => {
  const config = db.getAllConfig();
  const logs   = db.getRecentLogs(10);
  res.json({
    setup_complete:    !!config.setup_complete,
    family_name:       config.family_name,
    send_to:           config.send_to,
    schedule_hour:     config.schedule_hour ?? 7,
    timezone:          config.timezone,
    calendar_accounts: db.getCalendarAccounts().map(a => ({ id: a.id, name: a.name, provider: a.provider })),
    email_provider:    db.getEmailAccount()?.provider || null,
    recent_sends:      logs,
  });
});

// DELETE /api/calendar-accounts/:id
router.delete('/calendar-accounts/:id', (req, res) => {
  db.deleteCalendarAccount(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// POST /api/schedule — update schedule hour and reschedule
router.post('/schedule', (req, res) => {
  const { hour } = req.body;
  if (hour === undefined || isNaN(parseInt(hour, 10))) {
    return res.status(400).json({ error: 'hour required' });
  }
  db.setConfig('schedule_hour', parseInt(hour, 10));
  reschedule();
  res.json({ ok: true });
});

// GET /api/preview — render tomorrow's newsletter HTML in the browser (no send, no log)
router.get('/preview', async (req, res) => {
  try {
    const config = db.getAllConfig();
    const view   = req.query.view === 'print' ? 'print' : 'email';
    const { emailHtml, printHtml } = await buildNewsletterContent(config);
    res.send(view === 'print' ? printHtml : emailHtml);
  } catch (err) {
    res.status(500).send(`<pre style="font-family:monospace;padding:24px;">Preview error:\n\n${err.message}\n\n${err.stack}</pre>`);
  }
});

module.exports = router;
