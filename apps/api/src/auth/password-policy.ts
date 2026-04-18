import { createHash, timingSafeEqual } from 'node:crypto';

const MIN = 8;

export function assertStrongPassword(password: string) {
  const t = typeof password === 'string' ? password : '';
  if (t.length < MIN) throw new Error(`Password must be at least ${MIN} characters.`);
}

/** Compare optional setup secret to env without leaking length via timing (SHA-256 then timing-safe compare). */
export function compareBootstrapSecret(provided: string | undefined, expected: string): boolean {
  const a = createHash('sha256').update(provided ?? '', 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
