'use strict';

const { sendSMTP } = require('./smtp');

// Returns { info, refreshedCredentials }
async function sendEmail({ emailAccount, to, subject, htmlBody, fromName, attachments = [], cc }) {
  if (!emailAccount) throw new Error('No email account configured');
  if (emailAccount.provider !== 'smtp') throw new Error(`Unknown email provider: ${emailAccount.provider}`);
  const info = await sendSMTP({ credentials: emailAccount.credentials, to, subject, htmlBody, fromName, attachments, cc });
  return { info, refreshedCredentials: null };
}

module.exports = { sendEmail };
