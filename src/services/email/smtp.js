'use strict';

const nodemailer = require('nodemailer');

/**
 * Send email via SMTP.
 *
 * credentials: {
 *   host:     'smtp.fastmail.com',
 *   port:     465,
 *   secure:   true,
 *   user:     'user@fastmail.com',
 *   password: 'app-password',
 *   from:     'user@fastmail.com',  // defaults to user if omitted
 * }
 */
async function sendSMTP({ credentials, to, subject, htmlBody, fromName, attachments = [], cc }) {
  const transport = nodemailer.createTransport({
    host:   credentials.host,
    port:   credentials.port || 587,
    secure: credentials.secure !== false,
    auth: {
      user: credentials.user,
      pass: credentials.password,
    },
  });

  const from = credentials.from || credentials.user;

  const info = await transport.sendMail({
    from:        `"${fromName}" <${from}>`,
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

  return info;
}

module.exports = { sendSMTP };
