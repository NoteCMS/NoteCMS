import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    publicApiBaseUrl: 'https://api.example.com',
  },
}));

import { buildPublishCompletionCallbackUrl } from '../site/publish-webhook-service.js';

describe('buildPublishCompletionCallbackUrl', () => {
  it('embeds token as query param', () => {
    const url = buildPublishCompletionCallbackUrl('507f1f77bcf86cd799439011', 'tok_en');
    expect(url).toBe('https://api.example.com/hooks/site-build/507f1f77bcf86cd799439011?token=tok_en');
  });

  it('encodes token for query string', () => {
    const url = buildPublishCompletionCallbackUrl('site', 'a b');
    expect(url).toContain('token=a+b');
  });
});
