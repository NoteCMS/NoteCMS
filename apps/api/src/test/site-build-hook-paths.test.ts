import { describe, expect, it, vi } from 'vitest';
import { buildSiteBuildHookPath } from '../http/site-build-hook-paths.js';

vi.mock('../config/env.js', () => ({
  env: {
    publicApiBaseUrl: 'https://cms.example.com',
  },
}));

import { buildSiteBuildCompletionCallbackUrl } from '../site/site-build-service.js';

describe('buildSiteBuildHookPath', () => {
  it('builds site-only path under /api/hooks', () => {
    expect(buildSiteBuildHookPath('507f1f77bcf86cd799439011')).toBe(
      '/api/hooks/site-build/507f1f77bcf86cd799439011',
    );
  });

  it('builds per-build path under /api/hooks', () => {
    expect(buildSiteBuildHookPath('507f1f77bcf86cd799439011', 'staging')).toBe(
      '/api/hooks/site-build/507f1f77bcf86cd799439011/staging',
    );
  });
});

describe('buildSiteBuildCompletionCallbackUrl', () => {
  it('uses /api/hooks path for new completion URLs', () => {
    const url = buildSiteBuildCompletionCallbackUrl('507f1f77bcf86cd799439011', 'production', 'abc123');
    expect(url).toBe(
      'https://cms.example.com/api/hooks/site-build/507f1f77bcf86cd799439011/production?token=abc123',
    );
  });
});
