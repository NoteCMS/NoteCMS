import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

const MIN_DEV = 8;
const MIN_PROD = 10;

export function assertStrongPassword(password: string) {
  const t = typeof password === 'string' ? password : '';
  const min = env.nodeEnv === 'production' ? MIN_PROD : MIN_DEV;
  if (t.length < min) {
    throw new Error(`Use at least ${min} characters for your password.`);
  }
  if (!/[a-zA-Z]/.test(t) || !/[0-9]/.test(t)) {
    throw new Error('Include at least one letter and one number.');
  }
}

/** Compare optional setup secret to env without leaking length via timing (SHA-256 then timing-safe compare). */
export function compareBootstrapSecret(provided: string | undefined, expected: string): boolean {
  const a = createHash('sha256').update(provided ?? '', 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
