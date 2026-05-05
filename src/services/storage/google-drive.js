'use strict';

/**
 * Google Drive storage provider — uses OAuth 2.0 (user credentials).
 *
 * Service accounts cannot upload to regular My Drive folders because they
 * have no storage quota. OAuth uses the authorising user's quota instead,
 * which works for any Drive folder they own.
 *
 * Required config keys (set via the setup page OAuth flow):
 *   storage_google_drive_client_id      OAuth 2.0 client ID
 *   storage_google_drive_client_secret  OAuth 2.0 client secret
 *   storage_google_drive_refresh_token  Persisted after first authorisation
 *   storage_google_drive_folder_id      Drive folder ID to upload into
 *
 * Setup:
 *   1. Google Cloud Console → APIs & Services → Enable "Google Drive API"
 *   2. APIs & Services → Credentials → Create → OAuth 2.0 Client ID → Web application
 *   3. Add <your-app-url>/setup/storage/google-drive/callback as an Authorized redirect URI
 *   4. Copy Client ID and Client Secret into the setup page and save
 *   5. Click "Connect Google Drive" and authorise the app
 *   6. Create a Drive folder, share its ID in the setup page
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Exchange a stored refresh_token for a short-lived access_token.
 */
async function getAccessToken(config) {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      client_id:     config.storage_google_drive_client_id,
      client_secret: config.storage_google_drive_client_secret,
      refresh_token: config.storage_google_drive_refresh_token,
      grant_type:    'refresh_token',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(
      `Google token refresh failed: ${data.error_description || data.error || JSON.stringify(data)}`
    );
  }
  return data.access_token;
}

/**
 * Build the Google OAuth authorisation URL to redirect the user to.
 * prompt=consent ensures a refresh_token is always returned.
 */
function buildAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/drive.file',
    access_type:   'offline',
    prompt:        'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchange a one-time authorisation code for access + refresh tokens.
 * Returns the full token response object (contains refresh_token).
 */
async function exchangeCode(code, clientId, clientSecret, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json();
  if (!data.refresh_token) {
    throw new Error(
      `Token exchange failed: ${data.error_description || data.error || JSON.stringify(data)}`
    );
  }
  return data;
}

/**
 * Upload a PDF buffer to Google Drive using multipart upload.
 * Returns { id, url } where url is the Drive web view link.
 */
async function upload(buffer, filename, config) {
  const folderId = (config.storage_google_drive_folder_id || '').trim();
  if (!folderId) {
    throw new Error(
      'Google Drive folder ID is required. Create a folder in your Drive and paste its ID in Storage settings.'
    );
  }

  const accessToken = await getAccessToken(config);

  const metadata = JSON.stringify({ name: filename, parents: [folderId] });

  // Build multipart body: metadata part + binary PDF part
  const boundary   = `newsletter_${Date.now()}`;
  const metaBytes  = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
  );
  const dataHeader = Buffer.from(
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
  );
  const closing = Buffer.from(`\r\n--${boundary}--`);
  const body    = Buffer.concat([metaBytes, dataHeader, buffer, closing]);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
    {
      method:  'POST',
      headers: {
        Authorization:    `Bearer ${accessToken}`,
        'Content-Type':   `multipart/related; boundary=${boundary}`,
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
  return !!(
    config.storage_provider === 'google-drive' &&
    config.storage_google_drive_client_id &&
    config.storage_google_drive_client_secret &&
    config.storage_google_drive_refresh_token
  );
}

module.exports = { upload, isConfigured, buildAuthUrl, exchangeCode };
