'use strict';

const express = require('express');
const { google } = require('googleapis');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const db = require('../db/index');

const router = express.Router();

// ── GOOGLE OAUTH ──────────────────────────────────────────────

function getGoogleCredentials(req) {
  // Prefer env vars; fall back to DB-stored credentials from the walkthrough
  const config = db.getAllConfig();
  const clientId     = process.env.GOOGLE_CLIENT_ID     || config.google_client_id;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || config.google_client_secret;

  // Redirect URI priority:
  //   1. GOOGLE_REDIRECT_URI env var (explicit full override)
  //   2. app_url DB config (set via setup UI) + /auth/google/callback
  //   3. Auto-detect from request (works on any host/port, but blocked by Google for private IPs)
  let redirectUri;
  if (process.env.GOOGLE_REDIRECT_URI) {
    redirectUri = process.env.GOOGLE_REDIRECT_URI;
  } else if (config.app_url) {
    redirectUri = `${config.app_url.replace(/\/$/, '')}/auth/google/callback`;
  } else {
    const host     = req.headers.host || `localhost:${process.env.PORT || 3000}`;
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    redirectUri    = `${protocol}://${host}/auth/google/callback`;
  }

  return { clientId, clientSecret, redirectUri };
}

function getGoogleOAuth2Client(req) {
  const { clientId, clientSecret, redirectUri } = getGoogleCredentials(req);
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Step 1: Redirect to Google
router.get('/google', (req, res) => {
  const { purpose = 'calendar', accountId } = req.query; // purpose: 'calendar' | 'email'
  req.session.oauthPurpose   = purpose;
  req.session.oauthAccountId = accountId || null;

  const scopes = ['openid', 'email', 'profile'];
  if (purpose === 'calendar') scopes.push('https://www.googleapis.com/auth/calendar.readonly');
  if (purpose === 'email')    scopes.push('https://www.googleapis.com/auth/gmail.send');

  const auth = getGoogleOAuth2Client(req);
  const url  = auth.generateAuthUrl({
    access_type: 'offline',
    prompt:      'consent',
    scope:       scopes,
  });
  res.redirect(url);
});

// Step 2: Handle callback
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  const purpose   = req.session.oauthPurpose || 'calendar';
  const accountId = req.session.oauthAccountId;

  try {
    const auth = getGoogleOAuth2Client(req);
    const { tokens } = await auth.getToken(code);
    auth.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const { data: userInfo } = await oauth2.userinfo.get();

    const credentials = {
      ...tokens,
      email: userInfo.email,
    };

    if (purpose === 'email') {
      db.upsertEmailAccount({ provider: 'gmail', credentials });
      return res.redirect('/setup/email?connected=google');
    }

    // Calendar — list available calendars for user to pick
    const calendar  = google.calendar({ version: 'v3', auth });
    const calList   = await calendar.calendarList.list();
    const calendars = calList.data.items || [];

    // Store pending credentials in session for the next step
    req.session.pendingGoogleCreds     = credentials;
    req.session.pendingGoogleCalendars = calendars.map(c => ({ id: c.id, summary: c.summary, primary: c.primary }));
    req.session.pendingAccountId       = accountId;

    res.redirect('/setup/calendars/google-pick');
  } catch (err) {
    console.error('[auth/google] Error:', err.message);
    res.redirect('/setup/calendars?error=google-auth-failed');
  }
});

// ── MICROSOFT OAUTH ───────────────────────────────────────────

function getMsalClient() {
  return new ConfidentialClientApplication({
    auth: {
      clientId:     process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      authority:    'https://login.microsoftonline.com/common',
    },
  });
}

router.get('/microsoft', async (req, res) => {
  const { purpose = 'calendar' } = req.query;
  req.session.oauthPurpose = purpose;

  const scopes = ['openid', 'profile', 'email', 'offline_access'];
  if (purpose === 'calendar') scopes.push('Calendars.Read');
  if (purpose === 'email')    scopes.push('Mail.Send');

  const msalClient = getMsalClient();
  const { authCodeUrl } = await msalClient.getAuthCodeUrl({
    scopes,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
  });

  req.session.msalState = Math.random().toString(36).substring(2);
  res.redirect(authCodeUrl);
});

router.get('/microsoft/callback', async (req, res) => {
  const { code } = req.query;
  const purpose  = req.session.oauthPurpose || 'calendar';

  try {
    const msalClient = getMsalClient();
    const result     = await msalClient.acquireTokenByCode({
      code,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI,
      scopes:      ['Calendars.Read', 'Mail.Send', 'offline_access'],
    });

    const credentials = {
      access_token:  result.accessToken,
      refresh_token: result.account?.homeAccountId || '',
      expiry_date:   result.expiresOn?.getTime(),
      email:         result.account?.username,
    };

    if (purpose === 'email') {
      db.upsertEmailAccount({ provider: 'smtp', credentials }); // Outlook sends via Graph
      return res.redirect('/setup/email?connected=microsoft');
    }

    db.upsertCalendarAccount({
      name:        'Outlook',
      provider:    'outlook',
      is_reminder: false,
      credentials,
      metadata:    { displayName: 'Outlook', calendarIds: [] },
    });

    res.redirect('/setup/calendars?connected=outlook');
  } catch (err) {
    console.error('[auth/microsoft] Error:', err.message);
    res.redirect('/setup/calendars?error=microsoft-auth-failed');
  }
});

module.exports = router;
