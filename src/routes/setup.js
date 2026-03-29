'use strict';

const express    = require('express');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
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

// Extract blurbs-disabled calendar IDs from form body.
// Each calendar row posts `blurbs_enabled_<calId>` with hidden=0 + checkbox=1.
function blurbsDisabledFromBody(body, allCals) {
  return allCals
    .filter(c => {
      const val = [].concat(body[`blurbs_enabled_${c.id}`] || '0');
      return !val.some(v => v === '1');
    })
    .map(c => c.id);
}

// Google calendar picker (after OAuth)
router.get('/calendars/google-pick', (req, res) => {
  const pendingCals = req.session.pendingGoogleCalendars || [];
  res.render('setup-google-pick', {
    calendars: pendingCals,
    editMode: false,
    account: null,
    currentIds: new Set(),
    currentReminderIds: new Set(),
    currentBlurbsOffIds: new Set(),
    flash: req.query,
  });
});

router.post('/calendars/google-pick', (req, res) => {
  const credentials = req.session.pendingGoogleCreds;
  if (!credentials) return res.redirect('/setup/calendars?error=session-expired');

  const allCals   = JSON.parse(req.body.calendars_json || '[]');
  const selected  = [].concat(req.body.calendar_ids || []);
  const reminder  = [].concat(req.body.reminder_ids || []);
  const calNames  = {};
  const pendingCals = req.session.pendingGoogleCalendars || [];
  for (const c of pendingCals) calNames[c.id] = c.summary;
  const blurbsDisabled = blurbsDisabledFromBody(req.body, allCals.length ? allCals : pendingCals);

  const accountId = req.session.pendingAccountId;
  db.upsertCalendarAccount({
    id:          accountId ? parseInt(accountId, 10) : undefined,
    name:        'Google Calendar',
    provider:    'google',
    is_reminder: false,
    credentials,
    metadata: {
      calendarIds:              selected,
      reminderCalendarIds:      reminder,
      calendarNames:            calNames,
      blurbsDisabledCalendarIds: blurbsDisabled,
    },
  });

  delete req.session.pendingGoogleCreds;
  delete req.session.pendingGoogleCalendars;
  delete req.session.pendingAccountId;

  res.redirect('/setup/calendars?saved=google');
});

// Edit calendar account — re-fetch calendar list and allow re-selection
router.get('/calendars/:id/edit', async (req, res) => {
  try {
    const id      = parseInt(req.params.id, 10);
    const account = db.getCalendarAccount(id);
    if (!account) return res.redirect('/setup/calendars?error=Calendar+not+found');

    if (account.provider === 'google') {
      const config      = db.getAllConfig();
      const clientId    = process.env.GOOGLE_CLIENT_ID     || config.google_client_id;
      const clientSecret= process.env.GOOGLE_CLIENT_SECRET || config.google_client_secret;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI  || config.app_url
        ? `${(config.app_url || '').replace(/\/$/, '')}/auth/google/callback`
        : 'http://localhost:3000/auth/google/callback';
      const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      auth.setCredentials(account.credentials);
      const cal     = google.calendar({ version: 'v3', auth });
      const calList = await cal.calendarList.list();
      const calendars = (calList.data.items || []).map(c => ({ id: c.id, summary: c.summary, primary: c.primary }));
      const currentIds            = new Set(account.metadata?.calendarIds || []);
      const currentReminderIds    = new Set(account.metadata?.reminderCalendarIds || []);
      const currentBlurbsOffIds   = new Set(account.metadata?.blurbsDisabledCalendarIds || []);
      return res.render('setup-google-pick', {
        calendars, editMode: true, account,
        currentIds, currentReminderIds, currentBlurbsOffIds,
        flash: req.query,
      });
    }

    // For CalDAV / ICS / Outlook: just allow renaming
    res.render('setup-calendar-rename', { account, flash: req.query });
  } catch (err) {
    errRedirect(res, '/setup/calendars', err);
  }
});

router.post('/calendars/:id/edit', (req, res) => {
  try {
    const id      = parseInt(req.params.id, 10);
    const account = db.getCalendarAccount(id);
    if (!account) return res.redirect('/setup/calendars?error=Calendar+not+found');

    if (account.provider === 'google') {
      const selected = [].concat(req.body.calendar_ids || []);
      const reminder = [].concat(req.body.reminder_ids || []);
      const allCals  = JSON.parse(req.body.calendars_json || '[]');
      const calNames = {};
      for (const c of allCals) calNames[c.id] = c.summary;
      const blurbsDisabled = blurbsDisabledFromBody(req.body, allCals);
      const newName  = (req.body.account_name || '').trim() || account.name;
      db.upsertCalendarAccount({
        ...account,
        name:     newName,
        metadata: { calendarIds: selected, reminderCalendarIds: reminder, calendarNames: calNames, blurbsDisabledCalendarIds: blurbsDisabled },
      });
      return res.redirect('/setup/calendars?saved=edited');
    }

    // Rename only for other providers
    const newName = (req.body.account_name || '').trim() || account.name;
    db.upsertCalendarAccount({ ...account, name: newName });
    res.redirect('/setup/calendars?saved=edited');
  } catch (err) {
    errRedirect(res, '/setup/calendars', err);
  }
});

// Toggle blurbs for a calendar
router.post('/calendars/:id/blurbs', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const enabled = [].concat(req.body.blurbs_enabled).some(x => x === 'on' || x === '1');
  db.setCalendarBlurbs(id, enabled);
  res.redirect('/setup/calendars?saved=blurbs');
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
    const raw = (req.body.send_time || '').trim();
    if (!raw) throw new Error('A send time is required');

    let hour, minute;

    // "4:13 PM", "9 AM", "9:00am"
    const ampm = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (ampm) {
      hour   = parseInt(ampm[1], 10);
      minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
      const pm = ampm[3].toLowerCase() === 'pm';
      if (hour < 1 || hour > 12) throw new Error('Hour must be 1–12 when using AM/PM');
      if (hour === 12) hour = pm ? 12 : 0;
      else if (pm) hour += 12;
    } else {
      // "14:30", "9:00", "21"
      const hhmm = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
      if (!hhmm) throw new Error('Could not parse time — try "9:00 PM" or "21:00"');
      hour   = parseInt(hhmm[1], 10);
      minute = hhmm[2] ? parseInt(hhmm[2], 10) : 0;
    }

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new Error('Invalid time value');
    }
    db.setConfig('schedule_hour',   hour);
    db.setConfig('schedule_minute', minute);
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
    const { blurbs_enabled, travel_enabled, blurbs_debug, blurb_instruction } = req.body;
    // Accept 'on' (bare checkbox) or '1' (checkbox with hidden-field fallback)
    const boolField = v => [].concat(v).some(x => x === 'on' || x === '1');
    db.setConfig('blurbs_enabled', boolField(blurbs_enabled) ? '1' : '0');
    db.setConfig('travel_enabled', boolField(travel_enabled) ? '1' : '0');
    db.setConfig('blurbs_debug',   boolField(blurbs_debug)   ? '1' : '0');
    const instruction = (blurb_instruction || '').trim();
    db.setConfig('blurb_instruction', instruction || DEFAULT_BLURB_INSTRUCTION);
    res.redirect('/setup/blurbs?saved=1');
  } catch (err) {
    errRedirect(res, '/setup/blurbs', err);
  }
});

// ── BRANDING ──────────────────────────────────────────────────
router.get('/branding', (req, res) => {
  const config = db.getAllConfig();
  res.render('setup-branding', { config, flash: req.query });
});

router.post('/branding', (req, res) => {
  try {
    const { branding_primary_color_hex, branding_accent_color_hex, branding_logo_url } = req.body;
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    if (branding_primary_color_hex && !hexRe.test(branding_primary_color_hex)) throw new Error('Primary color must be a valid hex code (e.g. #1a2e4a)');
    if (branding_accent_color_hex  && !hexRe.test(branding_accent_color_hex))  throw new Error('Accent color must be a valid hex code (e.g. #c9a96e)');
    db.setConfig('branding_primary_color', branding_primary_color_hex || '#1a2e4a');
    db.setConfig('branding_accent_color',  branding_accent_color_hex  || '#c9a96e');
    db.setConfig('branding_logo_url',      (branding_logo_url || '').trim());
    res.redirect('/setup/branding?saved=1');
  } catch (err) {
    errRedirect(res, '/setup/branding', err);
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
