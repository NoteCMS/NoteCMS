import { describe, expect, it } from 'vitest';
import { buildPublicAssetUrl, usePublicAssetUrls } from '../assets/public-url.js';

describe('buildPublicAssetUrl', () => {
  it('joins base and key with encoded segments', () => {
    expect(buildPublicAssetUrl('https://cdn.example.com', 'site/abc/large.webp')).toBe(
      'https://cdn.example.com/site/abc/large.webp',
    );
  });

  it('strips trailing slash from base', () => {
    expect(buildPublicAssetUrl('https://cdn.example.com/', 'x/y.webp')).toBe('https://cdn.example.com/x/y.webp');
  });

  it('encodes unsafe characters in segments', () => {
    expect(buildPublicAssetUrl('https://cdn.example.com', 'a b/file name.webp')).toBe(
      'https://cdn.example.com/a%20b/file%20name.webp',
    );
  });
});

describe('usePublicAssetUrls', () => {
  it('returns false for empty values', () => {
    expect(usePublicAssetUrls(undefined)).toBe(false);
    expect(usePublicAssetUrls('')).toBe(false);
    expect(usePublicAssetUrls('   ')).toBe(false);
  });

  it('returns true when base URL is set', () => {
    expect(usePublicAssetUrls('https://cdn.example.com')).toBe(true);
  });
});
