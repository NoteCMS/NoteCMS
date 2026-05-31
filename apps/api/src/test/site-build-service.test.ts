import { describe, expect, it } from 'vitest';
import { assertSiteBuildSlug, assertSiteBuildTriggerRole } from '../site/site-build-service.js';

describe('assertSiteBuildSlug', () => {
  it('accepts typical slugs', () => {
    expect(assertSiteBuildSlug('production')).toBe('production');
    expect(assertSiteBuildSlug('Staging')).toBe('staging');
    expect(assertSiteBuildSlug('preview-2')).toBe('preview-2');
  });

  it('rejects invalid slugs', () => {
    expect(() => assertSiteBuildSlug('')).toThrow(/letter/i);
    expect(() => assertSiteBuildSlug('2live')).toThrow(/letter/i);
    expect(() => assertSiteBuildSlug('bad id')).toThrow(/letter/i);
  });
});

describe('assertSiteBuildTriggerRole', () => {
  it('accepts editor and owner', () => {
    expect(assertSiteBuildTriggerRole('editor')).toBe('editor');
    expect(assertSiteBuildTriggerRole('owner')).toBe('owner');
  });

  it('rejects other values', () => {
    expect(() => assertSiteBuildTriggerRole('viewer')).toThrow(/editor or owner/i);
  });
});
