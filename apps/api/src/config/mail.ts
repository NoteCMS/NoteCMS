import { env } from './env.js';

export function isMailConfigured(): boolean {
  return env.mailEnabled && Boolean(env.smtpHost?.trim()) && Boolean(env.mailFrom?.trim()) && Boolean(env.publicUrl?.trim());
}

export function getMailConfigStatus() {
  const enabled = env.mailEnabled;
  const configured = isMailConfigured();
  return { enabled, configured };
}
