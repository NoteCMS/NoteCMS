import { env } from '../config/env.js';

export function buildWebUrl(path: string): string {
  const base = env.publicUrl;
  if (!base) throw new Error('PUBLIC_URL is not configured');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
