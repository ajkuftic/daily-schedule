'use strict';

const { google }    = require('googleapis');
const nodemailer    = require('nodemailer');

/**
 * Send email via the Gmail REST API (not SMTP).
 *
 * The OAuth scope gmail.send is a REST API scope — it does NOT work with
 * SMTP/XOAUTH2 (which requires the https://mail.google.com/ scope).
 * We use nodemailer's stream transport to build the raw MIME message and
 * then post it to gmail.users.messages.send().
 *
 * credentials: { access_token, refresh_token, expiry_date, email }
 * Returns { info, refreshedCredentials } — refreshedCredentials is null if no refresh happened.
 */
async function sendGmail({ credentials, to, subject, htmlBody, fromName, attachments = [], cc }) {
  const db       = require('../../db/index');
  const dbConfig = db.getAllConfig();
  const clientId     = process.env.GOOGLE_CLIENT_ID     || dbConfig.google_client_id;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || dbConfig.google_client_secret;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI  || dbConfig.app_url
    ? `${(dbConfig.app_url || '').replace(/\/$/, '')}/auth/google/callback`
    : 'http://localhost:3000/auth/google/callback';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials(credentials);

  // Proactively refresh if the token is expired or about to expire (<60 s)
  let refreshedCredentials = null;
  if (credentials.expiry_date && Date.now() > credentials.expiry_date - 60_000) {
    const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshed);
    credentials          = { ...credentials, ...refreshed };
    refreshedCredentials = credentials;
  }

  // ── Build raw MIME message with nodemailer ────────────────────────────────
  const streamTransport = nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
  const { message: mimeStream } = await streamTransport.sendMail({
    from:        `"${fromName}" <${credentials.email}>`,
    to,
    cc,
    subject,
    html:        htmlBody,
    attachments: attachments.map(a => ({
      filename:    a.filename,
      content:     a.buffer,
      contentType: 'application/pdf',
    })),
  });

  // Collect stream into a buffer then base64url-encode for the Gmail API
  const chunks = [];
  await new Promise((resolve, reject) => {
    mimeStream.on('data',  chunk => chunks.push(chunk));
    mimeStream.on('end',   resolve);
    mimeStream.on('error', reject);
  });
  const raw = Buffer.concat(chunks)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // ── Send via Gmail REST API ───────────────────────────────────────────────
  const gmail  = google.gmail({ version: 'v1', auth: oauth2Client });
  const result = await gmail.users.messages.send({
    userId:      'me',
    requestBody: { raw },
  });

  return {
    info:                 result.data,
    refreshedCredentials,
  };
}

module.exports = { sendGmail };
