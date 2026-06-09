'use strict';

const express = require('express');
const db      = require('../db/index');
const { sendDailyNewsletter, buildNewsletterContent } = require('../services/newsletter');
const { sendIftttEmail } = require('../services/ifttt');
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
    // sendDailyNewsletter handles error logging internally
    sendDailyNewsletter(config).catch(err => {
      console.error('[api] send-now failed:', err.message);
    });
    res.json({ ok: true, message: 'Newsletter send started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/send-test — full send to a single address only (no printer, no webhooks)
router.post('/send-test', async (req, res) => {
  try {
    const config = db.getAllConfig();
    if (!config.setup_complete) {
      return res.status(400).json({ error: 'Setup not complete' });
    }
    const testEmail = (req.body.email || '').trim();
    if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    sendDailyNewsletter(config, { testEmail }).catch(err => {
      console.error('[api] send-test failed:', err.message);
    });
    res.json({ ok: true, message: `Test send started → ${testEmail}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/test-ifttt — fire a real IFTTT trigger email using live data
router.post('/test-ifttt', async (req, res) => {
  try {
    const config = db.getAllConfig();
    if (!config.setup_complete) {
      return res.status(400).json({ ok: false, error: 'Setup not complete' });
    }
    const emailAccount = db.getEmailAccount();
    if (!emailAccount) {
      return res.status(400).json({ ok: false, error: 'No email account configured' });
    }

    // Build live content (same pipeline as a real send) then fire IFTTT immediately
    const { weather, renderEvents, clothingTip, dateStr, timezone } =
      await buildNewsletterContent(config);

    const familyName = config.family_name || 'Family';
    const fromName   = config.from_name   || `The Daily ${familyName}`;

    await sendIftttEmail({ emailAccount, fromName, dateStr, weather, events: renderEvents, clothingTip, pdf: null, timezone });

    res.json({ ok: true, message: `IFTTT trigger email sent for ${dateStr}` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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

// GET /api/preview — render newsletter HTML/PDF in the browser (no send, no log)
// ?view=email|print|pdf  ?date=YYYY-MM-DD
router.get('/preview', async (req, res) => {
  try {
    const config     = db.getAllConfig();
    const view       = ['print', 'pdf'].includes(req.query.view) ? req.query.view : 'email';
    const targetDate = req.query.date || null;
    const { emailHtml, printHtml } = await buildNewsletterContent(config, { targetDate });

    if (view === 'pdf') {
      const { generatePDF } = require('../services/pdf');
      const familyName = config.family_name || 'Family';
      const pdf = await generatePDF(printHtml, `Daily ${familyName} Preview`, config.html2pdf_api_key);
      if (!pdf) {
        return res.status(503).send('<pre style="font-family:monospace;padding:24px;">PDF generation requires an html2pdf API key.\nAdd it at /setup/api-keys</pre>');
      }
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', `inline; filename="${pdf.filename}"`);
      return res.send(pdf.buffer);
    }

    res.send(view === 'print' ? printHtml : emailHtml);
  } catch (err) {
    res.status(500).send(`<pre style="font-family:monospace;padding:24px;">Preview error:\n\n${err.message}\n\n${err.stack}</pre>`);
  }
});

module.exports = router;
