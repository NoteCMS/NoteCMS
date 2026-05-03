import crypto from 'node:crypto';

/** 32-byte random token as 64-char hex (for Bearer header). */
export function generateReturnWebhookToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashReturnWebhookToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyReturnWebhookToken(token: string, storedHash: string): boolean {
  if (!token || !storedHash || storedHash.length !== 64) return false;
  const digest = hashReturnWebhookToken(token);
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}
