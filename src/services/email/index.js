'use strict';

const { sendGmail } = require('./gmail');
const { sendSMTP }  = require('./smtp');

// Returns { info, refreshedCredentials } — refreshedCredentials is null if no token refresh occurred.
async function sendEmail({ emailAccount, to, subject, htmlBody, fromName, attachments = [], cc }) {
  if (!emailAccount) throw new Error('No email account configured');

  switch (emailAccount.provider) {
    case 'gmail':
      return sendGmail({ credentials: emailAccount.credentials, to, subject, htmlBody, fromName, attachments, cc });
    case 'smtp': {
      const info = await sendSMTP({ credentials: emailAccount.credentials, to, subject, htmlBody, fromName, attachments, cc });
      return { info, refreshedCredentials: null };
    }
    default:
      throw new Error(`Unknown email provider: ${emailAccount.provider}`);
  }
}

module.exports = { sendEmail };
