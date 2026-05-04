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

module.exports = { uploadPDF, PROVIDERS };
