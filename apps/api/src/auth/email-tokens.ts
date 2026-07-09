import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import {
  AuthEmailTokenModel,
  type EmailTokenPurpose,
} from '../db/models/AuthEmailToken.js';

export function hashEmailToken(token: string): string {
  return createHash('sha256').update(`${env.jwtSecret}:email-token:${token}`).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function ttlMsForPurpose(purpose: EmailTokenPurpose): number {
  if (purpose === 'password_reset') return env.mailTokenTtlResetMinutes * 60_000;
  return env.mailTokenTtlInviteHours * 3_600_000;
}

export async function invalidateUnusedTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
  await AuthEmailTokenModel.updateMany(
    { userId, purpose, usedAt: null },
    { $set: { usedAt: new Date() } },
  );
}

export async function issueEmailToken(
  userId: string,
  purpose: EmailTokenPurpose,
): Promise<{ token: string }> {
  await invalidateUnusedTokens(userId, purpose);
  const token = generateToken();
  const tokenHash = hashEmailToken(token);
  const expiresAt = new Date(Date.now() + ttlMsForPurpose(purpose));
  await AuthEmailTokenModel.create({ userId, tokenHash, purpose, expiresAt });
  return { token };
}

export type ConsumedEmailToken = {
  userId: string;
  purpose: EmailTokenPurpose;
};

export type EmailTokenInspectStatus = 'valid' | 'used' | 'expired' | 'invalid';

export async function inspectEmailToken(
  rawToken: string,
  expectedPurpose: EmailTokenPurpose,
): Promise<EmailTokenInspectStatus> {
  const token = rawToken.trim();
  if (!token) return 'invalid';
  const tokenHash = hashEmailToken(token);
  const doc = await AuthEmailTokenModel.findOne({ tokenHash, purpose: expectedPurpose }).lean();
  if (!doc) return 'invalid';
  if (doc.usedAt) return 'used';
  if (doc.expiresAt.getTime() < Date.now()) return 'expired';
  return 'valid';
}

export async function consumeEmailToken(
  rawToken: string,
  expectedPurpose: EmailTokenPurpose,
): Promise<ConsumedEmailToken> {
  const token = rawToken.trim();
  if (!token) throw new Error('Invalid or expired link');
  const tokenHash = hashEmailToken(token);
  const doc = await AuthEmailTokenModel.findOne({ tokenHash, purpose: expectedPurpose }).lean();
  if (!doc) throw new Error('Invalid or expired link');
  if (doc.usedAt) throw new Error('This link has already been used');
  if (doc.expiresAt.getTime() < Date.now()) throw new Error('This link has expired');

  const stored = Buffer.from(doc.tokenHash, 'hex');
  const provided = Buffer.from(tokenHash, 'hex');
  if (stored.length !== provided.length || !timingSafeEqual(stored, provided)) {
    throw new Error('Invalid or expired link');
  }

  await AuthEmailTokenModel.updateOne({ _id: doc._id }, { $set: { usedAt: new Date() } });
  return { userId: String(doc.userId), purpose: doc.purpose as EmailTokenPurpose };
}

export async function invalidateTokensForUser(userId: string): Promise<void> {
  await AuthEmailTokenModel.updateMany({ userId, usedAt: null }, { $set: { usedAt: new Date() } });
}
