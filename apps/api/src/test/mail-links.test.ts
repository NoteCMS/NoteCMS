import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('buildWebUrl', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('joins PUBLIC_URL and path', async () => {
    vi.stubEnv('PUBLIC_URL', 'https://cms.example.com/');
    const { buildWebUrl } = await import('../mail/links.js');
    expect(buildWebUrl('/reset-password?token=abc')).toBe('https://cms.example.com/reset-password?token=abc');
  });

  it('throws when PUBLIC_URL is missing', async () => {
    vi.stubEnv('PUBLIC_URL', '');
    const { buildWebUrl } = await import('../mail/links.js');
    expect(() => buildWebUrl('/')).toThrow(/PUBLIC_URL/);
  });
});
