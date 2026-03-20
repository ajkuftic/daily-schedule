'use strict';

const { google } = require('googleapis');
const nodemailer = require('nodemailer');

/**
 * Send email via Gmail OAuth2.
 *
 * credentials: { access_token, refresh_token, expiry_date, email }
 * Returns { info, refreshedCredentials } — refreshedCredentials is null if no refresh happened.
 */
async function sendGmail({ credentials, to, subject, htmlBody, fromName, attachments = [], cc }) {
  const db       = require('../../db/index');
  const dbConfig = db.getAllConfig();
  const clientId     = process.env.GOOGLE_CLIENT_ID     || dbConfig.google_client_id;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || dbConfig.google_client_secret;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI  || 'http://localhost:3000/auth/google/callback';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials(credentials);

  // Refresh proactively if token is expired or about to expire
  let refreshedCredentials = null;
  if (credentials.expiry_date && Date.now() > credentials.expiry_date - 60000) {
    const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshed);
    credentials          = { ...credentials, ...refreshed };
    refreshedCredentials = credentials;
  }

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type:         'OAuth2',
      user:         credentials.email,
      accessToken:  credentials.access_token,
      refreshToken: credentials.refresh_token,
      expires:      credentials.expiry_date,
      clientId,
      clientSecret,
    },
  });

  const info = await transport.sendMail({
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

  return { info, refreshedCredentials };
}

module.exports = { sendGmail };
