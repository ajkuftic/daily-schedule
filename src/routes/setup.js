'use strict';

const express = require('express');
const db      = require('../db/index');
const { reschedule } = require('../scheduler');

const router = express.Router();

// ── DASHBOARD ─────────────────────────────────────────────────
router.get('/', (req, res) => {
  const config = db.getAllConfig();
  const logs   = db.getRecentLogs(10);
  const calendars = db.getCalendarAccounts();
  const emailAccount = db.getEmailAccount();
  res.render('index', { config, logs, calendars, emailAccount, flash: req.query });
});

// ── GOOGLE OAUTH WALKTHROUGH ──────────────────────────────────
router.get('/google-oauth', (req, res) => {
  const config     = db.getAllConfig();
  const returnTo   = req.query.return_to || '/setup/calendars';
  const host       = req.headers.host || `localhost:${process.env.PORT || 3000}`;
  const protocol   = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const redirectUri = `${protocol}://${host}/auth/google/callback`;
  res.render('setup-google-oauth', { config, returnTo, redirectUri, flash: req.query });
});

router.post('/google-oauth', (req, res) => {
  const { google_client_id, google_client_secret, return_to } = req.body;
  const returnTo = return_to || '/setup/calendars';
  if (google_client_id) db.setConfig('google_client_id', google_client_id);
  if (google_client_secret && !google_client_secret.startsWith('••')) {
    db.setConfig('google_client_secret', google_client_secret);
  }
  res.redirect(`/setup/google-oauth?saved=1&return_to=${encodeURIComponent(returnTo)}`);
});

// ── FAMILY / GENERAL SETTINGS ─────────────────────────────────
router.get('/family', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-family', { config, flash: req.query });
});

router.post('/family', (req, res) => {
  const { family_name, send_to, from_name, timezone, default_city, default_lat, default_lon } = req.body;
  db.setConfig('family_name',  family_name);
  db.setConfig('send_to',      send_to);
  db.setConfig('from_name',    from_name || `The Daily ${family_name}`);
  db.setConfig('timezone',     timezone);
  db.setConfig('default_city', default_city);
  db.setConfig('default_lat',  default_lat);
  db.setConfig('default_lon',  default_lon);
  res.redirect('/setup/family?saved=1');
});

// ── API KEYS ──────────────────────────────────────────────────
router.get('/api-keys', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-api-keys', { config, flash: req.query });
});

router.post('/api-keys', (req, res) => {
  const { claude_api_key, html2pdf_api_key, epson_connect_email } = req.body;
  if (claude_api_key)      db.setConfig('claude_api_key',      claude_api_key);
  if (html2pdf_api_key)    db.setConfig('html2pdf_api_key',    html2pdf_api_key);
  db.setConfig('epson_connect_email', epson_connect_email || '');
  res.redirect('/setup/api-keys?saved=1');
});

// ── CALENDARS ─────────────────────────────────────────────────
router.get('/calendars', (req, res) => {
  const accounts = db.getCalendarAccounts();
  res.render('setup-calendars', { accounts, flash: req.query });
});

// Save CalDAV account
router.post('/calendars/caldav', (req, res) => {
  const { name, server_url, username, password, auth_method, is_reminder } = req.body;
  db.upsertCalendarAccount({
    name,
    provider:    'caldav',
    is_reminder: !!is_reminder,
    credentials: { serverUrl: server_url, username, password, authMethod: auth_method || 'Basic' },
    metadata:    { displayName: name },
  });
  res.redirect('/setup/calendars?saved=caldav');
});

// Save ICS feed
router.post('/calendars/ics', (req, res) => {
  const { name, url, is_reminder } = req.body;
  db.upsertCalendarAccount({
    name,
    provider:    'ics',
    is_reminder: !!is_reminder,
    credentials: { url },
    metadata:    { displayName: name },
  });
  res.redirect('/setup/calendars?saved=ics');
});

// Google calendar picker (after OAuth)
router.get('/calendars/google-pick', (req, res) => {
  const pendingCals = req.session.pendingGoogleCalendars || [];
  res.render('setup-google-pick', { calendars: pendingCals, flash: req.query });
});

router.post('/calendars/google-pick', (req, res) => {
  const credentials = req.session.pendingGoogleCreds;
  if (!credentials) return res.redirect('/setup/calendars?error=session-expired');

  const selected  = [].concat(req.body.calendar_ids || []);
  const reminder  = [].concat(req.body.reminder_ids || []);
  const calNames  = {};
  const pendingCals = req.session.pendingGoogleCalendars || [];
  for (const c of pendingCals) calNames[c.id] = c.summary;

  const accountId = req.session.pendingAccountId;
  db.upsertCalendarAccount({
    id:          accountId ? parseInt(accountId, 10) : undefined,
    name:        'Google Calendar',
    provider:    'google',
    is_reminder: false,
    credentials,
    metadata: {
      calendarIds:         selected,
      reminderCalendarIds: reminder,
      calendarNames:       calNames,
    },
  });

  delete req.session.pendingGoogleCreds;
  delete req.session.pendingGoogleCalendars;
  delete req.session.pendingAccountId;

  res.redirect('/setup/calendars?saved=google');
});

// Delete calendar account
router.post('/calendars/delete/:id', (req, res) => {
  db.deleteCalendarAccount(parseInt(req.params.id, 10));
  res.redirect('/setup/calendars?deleted=1');
});

// ── EMAIL ─────────────────────────────────────────────────────
router.get('/email', (req, res) => {
  const account = db.getEmailAccount();
  res.render('setup-email', { account, flash: req.query });
});

router.post('/email/smtp', (req, res) => {
  const { host, port, secure, user, password, from } = req.body;
  db.upsertEmailAccount({
    provider:    'smtp',
    credentials: { host, port: parseInt(port, 10), secure: secure === 'on', user, password, from: from || user },
  });
  res.redirect('/setup/email?saved=smtp');
});

// ── SCHEDULE ──────────────────────────────────────────────────
router.get('/schedule', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-schedule', { config, flash: req.query });
});

router.post('/schedule', (req, res) => {
  const { hour } = req.body;
  db.setConfig('schedule_hour', parseInt(hour, 10));
  db.setConfig('setup_complete', true);
  reschedule();
  res.redirect('/setup/schedule?saved=1');
});

module.exports = router;
