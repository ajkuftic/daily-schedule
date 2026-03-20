'use strict';

const { google } = require('googleapis');
const nodemailer = require('nodemailer');

/**
 * Send email via Gmail OAuth2.
 *
 * credentials: { access_token, refresh_token, expiry_date }
 */
async function sendGmail({ credentials, to, subject, htmlBody, fromName, attachments = [], cc }) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
  oauth2Client.setCredentials(credentials);

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type:         'OAuth2',
      user:         credentials.email,
      accessToken:  credentials.access_token,
      refreshToken: credentials.refresh_token,
      expires:      credentials.expiry_date,
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  });

  const mailOptions = {
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
  };

  const info = await transport.sendMail(mailOptions);
  return info;
}

module.exports = { sendGmail };
