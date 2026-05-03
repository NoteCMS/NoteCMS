import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function encryptionKey(): Buffer {
  const raw = env.publishWebhookEncryptionKey;
  if (!raw?.trim()) {
    throw new Error('JWT_SECRET or PUBLISH_WEBHOOK_ENCRYPTION_KEY must be set to encrypt GitHub tokens.');
  }
  const t = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, 'hex');
  }
  return crypto.createHash('sha256').update(t, 'utf8').digest();
}

export function encryptPublishPat(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptPublishPat(stored: string): string {
  const buf = Buffer.from(stored, 'base64url');
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error('Invalid stored publish credential');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const data = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
