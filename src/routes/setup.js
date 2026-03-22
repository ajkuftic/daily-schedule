'use strict';

const express    = require('express');
const nodemailer = require('nodemailer');
const db         = require('../db/index');
const { reschedule } = require('../scheduler');

const router = express.Router();

// ── helpers ───────────────────────────────────────────────────────────────────

function errRedirect(res, url, err) {
  const msg = encodeURIComponent((err && err.message) || String(err));
  res.redirect(`${url}?error=${msg}`);
}

async function validateIcsUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ICS URL`);
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('URL does not appear to be a valid ICS/iCal feed');
}

async function validateCalDav({ serverUrl, username, password, authMethod }) {
  // Quick HTTP probe: try PROPFIND on the server root — a 401/207/405 all mean the server is reachable
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const probe = await fetch(serverUrl, {
    method:  'PROPFIND',
    headers: {
      Authorization: `Basic ${auth}`,
      Depth:         '0',
      'Content-Type': 'text/xml',
    },
    body:   '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    signal: AbortSignal.timeout(10_000),
  });
  // 207 = success, 401 = server reachable but bad credentials, anything else is a problem
  if (probe.status === 401) throw new Error('CalDAV authentication failed — check username and password');
  if (!probe.ok && probe.status !== 207) throw new Error(`CalDAV server returned HTTP ${probe.status}`);
}

// ── DASHBOARD ─────────────────────────────────────────────────
router.get('/', (req, res) => {
  const config = db.getAllConfig();
  const logs   = db.getRecentLogs(10);
  const calendars = db.getCalendarAccounts();
  const emailAccount = db.getEmailAccount();
  res.render('index', { config, logs, calendars, emailAccount, flash: req.query });
});

// ── GOOGLE OAUTH WALKTHROUGH ──────────────────────────────────
function deriveRedirectUri(req, config) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  if (config.app_url) return `${config.app_url.replace(/\/$/, '')}/auth/google/callback`;
  const host     = req.headers.host || `localhost:${process.env.PORT || 3000}`;
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocol}://${host}/auth/google/callback`;
}

router.get('/google-oauth', (req, res) => {
  const config      = db.getAllConfig();
  const returnTo    = req.query.return_to || '/setup/calendars';
  const redirectUri = deriveRedirectUri(req, config);
  const hostname    = new URL(redirectUri).hostname;
  const isPrivateIp = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(hostname);
  res.render('setup-google-oauth', { config, returnTo, redirectUri, isPrivateIp, flash: req.query });
});

router.post('/google-oauth', (req, res) => {
  try {
    const { google_client_id, google_client_secret, app_url, return_to } = req.body;
    const returnTo = return_to || '/setup/calendars';
    if (google_client_id) db.setConfig('google_client_id', google_client_id);
    if (google_client_secret && !google_client_secret.startsWith('••')) {
      db.setConfig('google_client_secret', google_client_secret);
    }
    // app_url: strip trailing slash; save empty string to clear
    const normalizedUrl = (app_url || '').trim().replace(/\/$/, '');
    db.setConfig('app_url', normalizedUrl);
    res.redirect(`/setup/google-oauth?saved=1&return_to=${encodeURIComponent(returnTo)}`);
  } catch (err) {
    errRedirect(res, '/setup/google-oauth', err);
  }
});

// ── FAMILY / GENERAL SETTINGS ─────────────────────────────────
router.get('/family', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-family', { config, flash: req.query });
});

router.post('/family', (req, res) => {
  try {
    const { family_name, send_to, from_name, timezone, default_city, default_lat, default_lon } = req.body;
    if (!family_name) throw new Error('Family name is required');
    if (!send_to)     throw new Error('Send-to email is required');
    if (!timezone)    throw new Error('Timezone is required');
    db.setConfig('family_name',  family_name);
    db.setConfig('send_to',      send_to);
    db.setConfig('from_name',    from_name || `The Daily ${family_name}`);
    db.setConfig('timezone',     timezone);
    db.setConfig('default_city', default_city);
    db.setConfig('default_lat',  default_lat);
    db.setConfig('default_lon',  default_lon);
    res.redirect('/setup/family?saved=1');
  } catch (err) {
    errRedirect(res, '/setup/family', err);
  }
});

// ── API KEYS ──────────────────────────────────────────────────
router.get('/api-keys', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-api-keys', { config, flash: req.query });
});

router.post('/api-keys', (req, res) => {
  try {
    const { claude_api_key, html2pdf_api_key, epson_connect_email } = req.body;
    if (claude_api_key   && !claude_api_key.startsWith('••'))   db.setConfig('claude_api_key',   claude_api_key);
    if (html2pdf_api_key && !html2pdf_api_key.startsWith('••')) db.setConfig('html2pdf_api_key', html2pdf_api_key);
    db.setConfig('epson_connect_email', epson_connect_email || '');
    res.redirect('/setup/api-keys?saved=1');
  } catch (err) {
    errRedirect(res, '/setup/api-keys', err);
  }
});

// ── CALENDARS ─────────────────────────────────────────────────
router.get('/calendars', (req, res) => {
  const accounts = db.getCalendarAccounts();
  res.render('setup-calendars', { accounts, flash: req.query });
});

// Save CalDAV account
router.post('/calendars/caldav', async (req, res) => {
  try {
    const { name, server_url, username, password, auth_method, is_reminder } = req.body;
    if (!server_url) throw new Error('Server URL is required');
    if (!username)   throw new Error('Username is required');
    if (!password)   throw new Error('Password is required');
    await validateCalDav({ serverUrl: server_url, username, password, authMethod: auth_method || 'Basic' });
    db.upsertCalendarAccount({
      name,
      provider:    'caldav',
      is_reminder: !!is_reminder,
      credentials: { serverUrl: server_url, username, password, authMethod: auth_method || 'Basic' },
      metadata:    { displayName: name },
    });
    res.redirect('/setup/calendars?saved=caldav');
  } catch (err) {
    errRedirect(res, '/setup/calendars', err);
  }
});

// Save ICS feed
router.post('/calendars/ics', async (req, res) => {
  try {
    const { name, url, is_reminder } = req.body;
    if (!url) throw new Error('ICS URL is required');
    await validateIcsUrl(url);
    db.upsertCalendarAccount({
      name,
      provider:    'ics',
      is_reminder: !!is_reminder,
      credentials: { url },
      metadata:    { displayName: name },
    });
    res.redirect('/setup/calendars?saved=ics');
  } catch (err) {
    errRedirect(res, '/setup/calendars', err);
  }
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

router.post('/email/smtp', async (req, res) => {
  try {
    const { host, port, user, password, from } = req.body;
    if (!host || !user || !password) throw new Error('Host, username, and password are required');
    const portNum  = parseInt(port, 10) || 587;
    const secure   = portNum === 465;
    const transport = nodemailer.createTransport({
      host,
      port:       portNum,
      secure,
      requireTLS: !secure,
      auth:       { user, pass: password },
    });
    await transport.verify();
    db.upsertEmailAccount({
      provider:    'smtp',
      credentials: { host, port: portNum, secure, user, password, from: from || user },
    });
    res.redirect('/setup/email?saved=smtp');
  } catch (err) {
    errRedirect(res, '/setup/email', err);
  }
});

// ── SCHEDULE ──────────────────────────────────────────────────
router.get('/schedule', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-schedule', { config, flash: req.query });
});

router.post('/schedule', (req, res) => {
  try {
    const { hour } = req.body;
    if (hour === undefined || isNaN(parseInt(hour, 10))) throw new Error('A send hour is required');
    db.setConfig('schedule_hour', parseInt(hour, 10));
    db.setConfig('setup_complete', true);
    reschedule();
    res.redirect('/setup/schedule?saved=1');
  } catch (err) {
    errRedirect(res, '/setup/schedule', err);
  }
});

// ── BLURBS ────────────────────────────────────────────────────
const DEFAULT_BLURB_INSTRUCTION = `A 1-2 sentence blurb about the event itself. Friendly and warm, specific and helpful. Do NOT start with the event name. Do NOT use quotes. Under 40 words.`;

router.get('/blurbs', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-blurbs', { config, DEFAULT_BLURB_INSTRUCTION, flash: req.query });
});

router.post('/blurbs', (req, res) => {
  try {
    const { blurbs_enabled, blurb_instruction } = req.body;
    db.setConfig('blurbs_enabled', blurbs_enabled === 'on' ? '1' : '0');
    const instruction = (blurb_instruction || '').trim();
    db.setConfig('blurb_instruction', instruction || DEFAULT_BLURB_INSTRUCTION);
    res.redirect('/setup/blurbs?saved=1');
  } catch (err) {
    errRedirect(res, '/setup/blurbs', err);
  }
});

// ── WEBHOOKS ──────────────────────────────────────────────────
router.get('/webhooks', (req, res) => {
  // Auto-generate a secret on first visit
  if (!db.getConfig('webhook_secret')) {
    const crypto = require('crypto');
    db.setConfig('webhook_secret', crypto.randomBytes(24).toString('hex'));
  }
  const config = db.getAllConfig();
  const host     = req.headers.host || `localhost:${process.env.PORT || 3000}`;
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  res.render('setup-webhooks', { config, host, protocol, flash: req.query });
});

router.post('/webhooks', (req, res) => {
  try {
    const { action, webhook_outgoing_url } = req.body;

    if (action === 'regenerate') {
      const crypto = require('crypto');
      db.setConfig('webhook_secret', crypto.randomBytes(24).toString('hex'));
    }

    if (action === 'save-outgoing') {
      db.setConfig('webhook_outgoing_url', webhook_outgoing_url || '');
    }

    res.redirect('/setup/webhooks?saved=1');
  } catch (err) {
    errRedirect(res, '/setup/webhooks', err);
  }
});

module.exports = router;
