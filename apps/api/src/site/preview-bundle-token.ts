import crypto from 'node:crypto';

/** Random secret for preview Bearer auth (store only SHA-256 hex). */
export function generatePreviewBundleSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashPreviewBundleSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function verifyPreviewBundleSecret(secret: string, storedHash: string): boolean {
  if (!secret || !storedHash || storedHash.length !== 64) return false;
  const digest = hashPreviewBundleSecret(secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(storedHash, 'hex'));
  } catch {
    return false;
  }
}
