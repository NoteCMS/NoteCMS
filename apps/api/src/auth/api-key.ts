import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiKeyModel } from '../db/models/ApiKey.js';
import { env } from '../config/env.js';

const PREFIX = 'ncms_v1_';

export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(`${env.jwtSecret}:apikey:${secret}`).digest('hex');
}

/** Full secret material (64 hex chars). */
export function generateApiKeySecret(): string {
  return randomBytes(32).toString('hex');
}

export function formatApiKeyToken(keyId: string, secretHex: string): string {
  return `${PREFIX}${keyId}_${secretHex}`;
}

export function parseApiKeyToken(raw: string): { id: string; secret: string } | null {
  if (!raw.startsWith(PREFIX)) return null;
  const body = raw.slice(PREFIX.length);
  if (body.length < 24 + 1 + 64) return null;
  const id = body.slice(0, 24);
  if (body[24] !== '_') return null;
  const secret = body.slice(25);
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  if (!/^[a-f0-9]{64}$/i.test(secret)) return null;
  return { id, secret };
}

export async function verifyApiKeyToken(raw: string): Promise<{ id: string; siteId: string } | null> {
  const parsed = parseApiKeyToken(raw.trim());
  if (!parsed) return null;

  const doc = await ApiKeyModel.findOne({ _id: parsed.id, revokedAt: null }).lean();
  if (!doc) return null;

  const computed = Buffer.from(hashApiKeySecret(parsed.secret), 'hex');
  const stored = Buffer.from(doc.secretHash, 'hex');
  if (computed.length !== stored.length || !timingSafeEqual(computed, stored)) return null;

  void ApiKeyModel.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date() } }).exec();

  return { id: String(doc._id), siteId: String(doc.siteId) };
}
