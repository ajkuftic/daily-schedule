'use strict';

const { sendGmail } = require('./gmail');
const { sendSMTP }  = require('./smtp');

async function sendEmail({ emailAccount, to, subject, htmlBody, fromName, attachments = [], cc }) {
  if (!emailAccount) throw new Error('No email account configured');

  switch (emailAccount.provider) {
    case 'gmail':
      return sendGmail({ credentials: emailAccount.credentials, to, subject, htmlBody, fromName, attachments, cc });
    case 'smtp':
      return sendSMTP({ credentials: emailAccount.credentials, to, subject, htmlBody, fromName, attachments, cc });
    default:
      throw new Error(`Unknown email provider: ${emailAccount.provider}`);
  }
}

module.exports = { sendEmail };
