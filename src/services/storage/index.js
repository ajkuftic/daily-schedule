'use strict';

/**
 * Modular PDF cloud storage.
 *
 * Each provider module must export:
 *   async upload(buffer, filename, config) → { url?, path?, id? }
 *   isConfigured(config)                  → boolean
 *
 * To add a new provider:
 *   1. Create src/services/storage/<name>.js implementing the interface above
 *   2. Add it to PROVIDERS below
 *   3. Add its config fields to the setup page
 */

const PROVIDERS = {
  'google-drive': require('./google-drive'),
  's3':           require('./s3'),
  'local':        require('./local'),
};

/**
 * Upload a PDF buffer using the configured provider.
 * Returns the provider result ({ url, path, id, … }) or null on failure/disabled.
 */
async function uploadPDF(buffer, filename, config) {
  const provider = config.storage_provider;
  if (!provider || !PROVIDERS[provider]) return null;

  try {
    const result = await PROVIDERS[provider].upload(buffer, filename, config);
    console.log(`[storage:${provider}] Saved: ${result.url || result.path || 'ok'}`);
    return result;
  } catch (err) {
    console.error(`[storage:${provider}] Upload failed:`, err.message);
    return null;
  }
}

/**
 * Generate a download link for a previously uploaded file.
 *
 * - S3-compatible: returns a fresh pre-signed URL (expires in 7 days)
 * - Google Drive:  returns the stored webViewLink (permanent, requires Google sign-in)
 * - Local:         returns an app-served URL path  (/newsletters/files/<filename>)
 *
 * @param {string} filename  - the stored filename
 * @param {string} provider  - storage provider key
 * @param {object} config    - full app config (for S3 credentials)
 * @param {string} driveUrl  - pre-stored Drive webViewLink (Google Drive only)
 * @returns {string|null}    - URL string or null if unsupported
 */
function generateLink(filename, provider, config, driveUrl) {
  if (provider === 's3') {
    return PROVIDERS['s3'].presignUrl(filename, config);
  }
  if (provider === 'google-drive') {
    return driveUrl || null;
  }
  if (provider === 'local') {
    return `/newsletters/files/${encodeURIComponent(filename)}`;
  }
  return null;
}

module.exports = { uploadPDF, generateLink, PROVIDERS };
