import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isMailConfigured', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when mail is disabled', async () => {
    vi.stubEnv('MAIL_ENABLED', 'false');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('MAIL_FROM', 'noreply@example.com');
    vi.stubEnv('PUBLIC_URL', 'https://cms.example.com');
    const { isMailConfigured } = await import('../config/mail.js');
    expect(isMailConfigured()).toBe(false);
  });

  it('is true when all required values are set', async () => {
    vi.stubEnv('MAIL_ENABLED', 'true');
    vi.stubEnv('SMTP_HOST', 'smtp.example.com');
    vi.stubEnv('MAIL_FROM', 'noreply@example.com');
    vi.stubEnv('PUBLIC_URL', 'https://cms.example.com');
    const { isMailConfigured } = await import('../config/mail.js');
    expect(isMailConfigured()).toBe(true);
  });
});
