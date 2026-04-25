// lib/crypto.js
// Symmetric AES-256-GCM encryption for sensitive data at rest (API keys).
// Uses Node.js built-in crypto — no extra dependencies.

import crypto from 'crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey() {
  const raw = config.encryption.key;
  // Derive a 32-byte key from whatever string is provided
  return crypto.createHash('sha256').update(raw).digest();
}

/**
 * Encrypt plaintext → "iv:tag:ciphertext" (base64 parts, colon-separated)
 */
export function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv  = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt "iv:tag:ciphertext" → original plaintext
 */
export function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  // Handle legacy unencrypted values (plain sk- keys stored before this patch)
  if (!ciphertext.includes(':')) return ciphertext;
  const [ivB64, tagB64, dataB64] = ciphertext.split(':');
  const key       = getKey();
  const iv        = Buffer.from(ivB64,  'base64');
  const tag       = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64,'base64');
  const decipher  = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
