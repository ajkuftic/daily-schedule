'use strict';

/**
 * S3-compatible storage provider.
 *
 * Works with Cloudflare R2, Backblaze B2, AWS S3, and any other
 * S3-compatible object store. Uses AWS Signature Version 4 signing
 * with a simple PUT upload — no SDK required.
 *
 * Required config keys:
 *   storage_s3_endpoint          Full base URL  (e.g. https://abc.r2.cloudflarestorage.com)
 *   storage_s3_region            Signing region (e.g. auto, us-east-1, us-west-004)
 *   storage_s3_bucket            Bucket name
 *   storage_s3_access_key_id     Access key / key ID
 *   storage_s3_secret_access_key Secret access key
 */

const crypto = require('crypto');

// ── AWS Signature V4 helpers ──────────────────────────────────

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secret, dateStr, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, dateStr), region), service), 'aws4_request');
}

/**
 * Sign and execute a PUT upload to any S3-compatible endpoint.
 * Returns { url } — the object's path URL (may not be publicly accessible
 * depending on bucket ACL settings; it's stored for logging purposes).
 */
async function upload(buffer, filename, config) {
  const endpoint  = (config.storage_s3_endpoint  || '').replace(/\/$/, '');
  const region    = (config.storage_s3_region     || 'auto').trim();
  const bucket    = (config.storage_s3_bucket     || '').trim();
  const accessKey = (config.storage_s3_access_key_id     || '').trim();
  const secretKey = (config.storage_s3_secret_access_key || '').trim();

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error('S3 storage is not fully configured (endpoint, bucket, and keys are required)');
  }

  // S3 key = just the filename; encode each path segment for the canonical URI
  const key        = filename.split('/').map(encodeURIComponent).join('/');
  const objectUrl  = `${endpoint}/${bucket}/${key}`;
  const urlObj     = new URL(objectUrl);
  const host       = urlObj.hostname;
  const canonPath  = urlObj.pathname;

  // Timestamp strings required by Signature V4
  const now         = new Date();
  const amzDate     = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStr     = amzDate.substring(0, 8);

  const bodyHash    = sha256Hex(buffer);
  const contentType = 'application/pdf';

  // Canonical headers must be sorted alphabetically by header name
  const canonHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${bodyHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonRequest = [
    'PUT',
    canonPath,
    '',           // no query string
    canonHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credScope   = `${dateStr}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credScope,
    sha256Hex(canonRequest),
  ].join('\n');

  const signingKey  = getSigningKey(secretKey, dateStr, region, 's3');
  const signature   = hmac(signingKey, stringToSign).toString('hex');
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(objectUrl, {
    method: 'PUT',
    headers: {
      Authorization:          authorization,
      'Content-Type':         contentType,
      'Content-Length':       String(buffer.length),
      'x-amz-content-sha256': bodyHash,
      'x-amz-date':           amzDate,
    },
    body:   buffer,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S3 upload failed (HTTP ${res.status}): ${text}`);
  }

  return { url: objectUrl };
}

/**
 * Generate a pre-signed GET URL for a stored object.
 * The URL is self-contained and expires after `expirySeconds` (default 7 days).
 * No network call is made — signing is pure crypto.
 *
 * @param {string} filename      - the object key / filename
 * @param {object} config        - app config (same shape as upload())
 * @param {number} expirySeconds - link lifetime in seconds (max 604800 for B2)
 */
function presignUrl(filename, config, expirySeconds = 604800) {
  const endpoint  = (config.storage_s3_endpoint        || '').replace(/\/$/, '');
  const region    = (config.storage_s3_region           || 'auto').trim();
  const bucket    = (config.storage_s3_bucket           || '').trim();
  const accessKey = (config.storage_s3_access_key_id    || '').trim();
  const secretKey = (config.storage_s3_secret_access_key || '').trim();

  const key       = filename.split('/').map(encodeURIComponent).join('/');
  const objectUrl = `${endpoint}/${bucket}/${key}`;
  const urlObj    = new URL(objectUrl);
  const host      = urlObj.hostname;
  const path      = urlObj.pathname;

  const now     = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStr = amzDate.substring(0, 8);

  const credScope  = `${dateStr}/${region}/s3/aws4_request`;
  const credential = `${accessKey}/${credScope}`;

  // Query parameters must be sorted alphabetically for the canonical request
  const qp = new URLSearchParams([
    ['X-Amz-Algorithm',     'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential',    credential],
    ['X-Amz-Date',          amzDate],
    ['X-Amz-Expires',       String(expirySeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ]);
  qp.sort();

  const canonRequest = [
    'GET',
    path,
    qp.toString(),
    `host:${host}\n`,   // canonical headers (trailing newline required)
    'host',             // signed headers
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credScope,
    sha256Hex(canonRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretKey, dateStr, region, 's3');
  const signature  = hmac(signingKey, stringToSign).toString('hex');

  qp.append('X-Amz-Signature', signature);
  return `${objectUrl}?${qp.toString()}`;
}

function isConfigured(config) {
  return !!(
    config.storage_provider === 's3' &&
    config.storage_s3_endpoint &&
    config.storage_s3_bucket &&
    config.storage_s3_access_key_id &&
    config.storage_s3_secret_access_key
  );
}

module.exports = { upload, presignUrl, isConfigured };
