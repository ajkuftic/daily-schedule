'use strict';

/**
 * Google Drive storage provider — uses a Service Account (no OAuth browser flow).
 *
 * Required config keys:
 *   storage_google_drive_credentials  JSON string of the service account key file
 *   storage_google_drive_folder_id    (optional) Drive folder ID to upload into
 *
 * Setup:
 *   1. Google Cloud Console → APIs & Services → Enable "Google Drive API"
 *   2. IAM & Admin → Service Accounts → Create → Download JSON key
 *   3. Paste the JSON into the setup page
 *   4. Share your Drive folder with the service account email (Editor access)
 *   5. Copy the folder ID from the folder URL and paste it into the setup page
 */

const crypto = require('crypto');

/**
 * Mint a short-lived access token using the service account JWT flow.
 */
async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  })).toString('base64url');

  const unsigned = `${header}.${payload}`;

  // Aggressively normalise the PEM key — handles literal \n sequences,
  // CRLF line endings, and other whitespace issues that survive storage
  // round-trips or copy-paste from different operating systems.
  const keyPem = (credentials.private_key || '')
    .replace(/\\n/g, '\n')   // literal backslash-n → real newline
    .replace(/\r\n/g, '\n')  // CRLF → LF
    .replace(/\r/g, '\n');   // bare CR → LF

  console.log('[storage:google-drive] Key header:', JSON.stringify(keyPem.substring(0, 40)));
  console.log('[storage:google-drive] Key length:', keyPem.length, '| has newlines:', keyPem.includes('\n'));

  // Use the modern one-shot crypto.sign() API — more consistent with
  // PKCS#8 keys across OpenSSL versions than createSign().
  const sig       = crypto.sign('sha256', Buffer.from(unsigned), keyPem);
  const signature = sig.toString('base64url');
  const jwt       = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Google auth failed: ${data.error_description || data.error || JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Upload a PDF buffer to Google Drive using multipart upload.
 * Returns { id, url } where url is the Drive web view link.
 */
async function upload(buffer, filename, config) {
  // db.getAllConfig() auto-parses JSON objects, so credentials may already be an object
  const raw         = config.storage_google_drive_credentials;
  const credentials = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const folderId    = (config.storage_google_drive_folder_id || '').trim();
  const accessToken = await getAccessToken(credentials);

  const metadata = JSON.stringify({
    name:    filename,
    parents: folderId ? [folderId] : undefined,
  });

  // Build multipart body: metadata part + binary PDF part
  const boundary   = `newsletter_${Date.now()}`;
  const metaBytes  = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
  );
  const dataHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const closing    = Buffer.from(`\r\n--${boundary}--`);
  const body       = Buffer.concat([metaBytes, dataHeader, buffer, closing]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed (HTTP ${res.status}): ${text}`);
  }

  const file = await res.json();
  return { id: file.id, url: file.webViewLink };
}

function isConfigured(config) {
  return !!(config.storage_provider === 'google-drive' && config.storage_google_drive_credentials);
}

module.exports = { upload, isConfigured };
