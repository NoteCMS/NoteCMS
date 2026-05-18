import { describe, expect, it } from 'vitest';
import { buildCanonicalPath, getDefaultPermalinkTemplate, normalizeContentTypeRoutingOptions } from './permalink.js';
import { slugify } from './slugify.js';

describe('slugify', () => {
  it('strips diacritics and special chars', () => {
    expect(slugify('My Great Novel!')).toBe('my-great-novel');
    expect(slugify('Café')).toBe('cafe');
  });
});

describe('buildCanonicalPath', () => {
  it('defaults to type slug prefix', () => {
    const path = buildCanonicalPath({
      contentType: { slug: 'books', options: { hasSlug: true } },
      entry: { id: 'e1', slug: 'dune', publishedAt: '2026-05-07T12:00:00.000Z', createdAt: '2026-05-01T00:00:00.000Z' },
    });
    expect(path).toBe('/books/dune');
  });

  it('maps homepage to slash for root template', () => {
    const path = buildCanonicalPath({
      contentType: {
        slug: 'page',
        options: { hasSlug: true, permalinkTemplate: '/:slug', homepage: { enabled: true, entrySlug: 'home' } },
      },
      entry: { id: 'e1', slug: 'home', publishedAt: null, createdAt: '2026-05-01T00:00:00.000Z' },
    });
    expect(path).toBe('/');
  });
});

describe('normalizeContentTypeRoutingOptions', () => {
  it('keeps default template when omitted', () => {
    const out = normalizeContentTypeRoutingOptions({ hasSlug: true }, true, 'books');
    expect((out as { permalinkTemplate?: string }).permalinkTemplate).toBe(getDefaultPermalinkTemplate());
  });
});
