'use strict';

const crypto = require('crypto');

const MARKER = 'enc:v1:';

function deriveKey() {
  const secret = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'change-me';
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const str = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const key  = deriveKey();
  const iv   = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc  = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return MARKER + iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decrypt(value) {
  if (!value || !value.startsWith(MARKER)) return value; // legacy plaintext — return as-is
  const parts = value.slice(MARKER.length).split(':');
  if (parts.length !== 3) return value;
  const [ivHex, tagHex, encHex] = parts;
  try {
    const key    = deriveKey();
    const iv     = Buffer.from(ivHex, 'hex');
    const tag    = Buffer.from(tagHex, 'hex');
    const enc    = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  } catch {
    return value; // decryption failed — return raw (don't crash)
  }
}

module.exports = { encrypt, decrypt };
