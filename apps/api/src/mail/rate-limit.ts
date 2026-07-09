import { env } from '../config/env.js';

const hits = new Map<string, number[]>();

export function assertMailRateLimit(key: string): void {
  const now = Date.now();
  const windowMs = env.mailRateLimitWindowMs;
  const max = env.mailRateLimitMax;
  const normalized = key.trim().toLowerCase();
  const recent = (hits.get(normalized) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    throw new Error('Too many email requests. Try again later.');
  }
  recent.push(now);
  hits.set(normalized, recent);
}

export function resetMailRateLimitForTests() {
  hits.clear();
}
