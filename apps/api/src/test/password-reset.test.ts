import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMailRateLimitForTests } from '../mail/rate-limit.js';

describe('assertMailRateLimit', () => {
  beforeEach(() => {
    resetMailRateLimitForTests();
    vi.stubEnv('MAIL_RATE_LIMIT_MAX', '2');
    vi.stubEnv('MAIL_RATE_LIMIT_WINDOW_MS', '60000');
  });

  afterEach(() => {
    resetMailRateLimitForTests();
    vi.unstubAllEnvs();
  });

  it('allows requests under the limit', async () => {
    const { assertMailRateLimit: limit } = await import('../mail/rate-limit.js');
    expect(() => limit('user@example.com')).not.toThrow();
    expect(() => limit('user@example.com')).not.toThrow();
  });

  it('blocks when the limit is exceeded', async () => {
    const { assertMailRateLimit: limit } = await import('../mail/rate-limit.js');
    limit('user@example.com');
    limit('user@example.com');
    limit('user@example.com');
    expect(() => limit('user@example.com')).toThrow(/Too many email requests/);
  });
});

describe('mail templates', () => {
  it('includes reset URL in password reset email', async () => {
    const { passwordResetEmail } = await import('../mail/templates.js');
    const { html, text, subject } = passwordResetEmail({
      resetUrl: 'https://cms.example.com/reset-password?token=xyz',
      expiresIn: '1 hour',
    });
    expect(subject).toContain('Reset');
    expect(html).toContain('https://cms.example.com/reset-password?token=xyz');
    expect(text).toContain('https://cms.example.com/reset-password?token=xyz');
    expect(html).toContain('>note</td>');
    expect(html).toContain('v:roundrect');
    expect(html).toContain('Arial,Helvetica');
  });
});
