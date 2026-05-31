import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../auth/types.js';
import {
  PAGES_CONTENT_TYPE_SLUG,
  META_DESCRIPTION_MAX_LENGTH,
  META_TITLE_MAX_LENGTH,
  emptyEntryMeta,
  entryMetaDiffersFromPublished,
  isMetaTaxonomyEnabled,
  normalizeEntryMetaInput,
  normalizeMetaTaxonomyOptions,
  publishedMetaPayloadFromDoc,
  resolveEntryMetaForReader,
} from './meta-taxonomy.js';

describe('isMetaTaxonomyEnabled', () => {
  it('is always enabled for pages slug', () => {
    expect(isMetaTaxonomyEnabled({ slug: PAGES_CONTENT_TYPE_SLUG, options: {} })).toBe(true);
    expect(isMetaTaxonomyEnabled({ slug: PAGES_CONTENT_TYPE_SLUG, options: { metaTaxonomy: { enabled: false } } })).toBe(
      true,
    );
  });

  it('follows metaTaxonomy.enabled for other types', () => {
    expect(isMetaTaxonomyEnabled({ slug: 'posts', options: {} })).toBe(false);
    expect(isMetaTaxonomyEnabled({ slug: 'posts', options: { metaTaxonomy: { enabled: true } } })).toBe(true);
  });
});

describe('normalizeMetaTaxonomyOptions', () => {
  it('forces enabled on pages and rejects disable attempts', () => {
    expect(normalizeMetaTaxonomyOptions('pages', {})).toEqual({ metaTaxonomy: { enabled: true } });
    expect(() =>
      normalizeMetaTaxonomyOptions('pages', { metaTaxonomy: { enabled: false } }),
    ).toThrow(/cannot be disabled/i);
  });

  it('sets or strips metaTaxonomy for other slugs', () => {
    expect(normalizeMetaTaxonomyOptions('blog', { metaTaxonomy: { enabled: true }, hasSlug: true })).toEqual({
      metaTaxonomy: { enabled: true },
      hasSlug: true,
    });
    expect(normalizeMetaTaxonomyOptions('blog', { metaTaxonomy: { enabled: false } })).toEqual({});
  });
});

describe('normalizeEntryMetaInput', () => {
  it('rejects meta when disabled', () => {
    expect(() => normalizeEntryMetaInput({ title: 'x' }, { enabled: false })).toThrow(/not enabled/i);
    expect(normalizeEntryMetaInput(undefined, { enabled: false })).toEqual(emptyEntryMeta());
  });

  it('trims and caps lengths', () => {
    const longTitle = 't'.repeat(META_TITLE_MAX_LENGTH + 10);
    const longDesc = 'd'.repeat(META_DESCRIPTION_MAX_LENGTH + 10);
    const meta = normalizeEntryMetaInput({ title: `  ${longTitle}  `, description: longDesc }, { enabled: true });
    expect(meta.title).toHaveLength(META_TITLE_MAX_LENGTH);
    expect(meta.description).toHaveLength(META_DESCRIPTION_MAX_LENGTH);
  });
});

describe('resolveEntryMetaForReader', () => {
  const draftReaderCtx = {} as RequestContext;
  const publishedOnlyCtx = { apiKey: { scopes: ['entries:read'] } } as RequestContext;

  it('returns draft meta for admin/session readers', () => {
    const doc = {
      lifecycleStatus: 'published',
      meta: { title: 'Draft title', description: 'Draft desc' },
      publishedMeta: { title: 'Live title', description: 'Live desc' },
    };
    expect(resolveEntryMetaForReader(doc, draftReaderCtx)).toEqual({
      title: 'Draft title',
      description: 'Draft desc',
    });
  });

  it('returns published meta for read-only API keys on published entries', () => {
    const doc = {
      lifecycleStatus: 'published',
      meta: { title: 'Draft title', description: 'Draft desc' },
      publishedMeta: { title: 'Live title', description: 'Live desc' },
    };
    expect(resolveEntryMetaForReader(doc, publishedOnlyCtx)).toEqual({
      title: 'Live title',
      description: 'Live desc',
    });
  });

  it('returns empty meta for draft-only entries on read-only keys', () => {
    const doc = {
      lifecycleStatus: 'draft',
      meta: { title: 'Draft title', description: 'Draft desc' },
      publishedMeta: { title: null, description: null },
    };
    expect(resolveEntryMetaForReader(doc, publishedOnlyCtx)).toEqual(emptyEntryMeta());
  });
});

describe('entryMetaDiffersFromPublished', () => {
  it('detects meta drift on published entries', () => {
    expect(
      entryMetaDiffersFromPublished({
        meta: { title: 'a', description: 'b' },
        publishedMeta: { title: 'a', description: 'b' },
      }),
    ).toBe(false);
    expect(
      entryMetaDiffersFromPublished({
        meta: { title: 'changed', description: 'b' },
        publishedMeta: { title: 'a', description: 'b' },
      }),
    ).toBe(true);
  });
});

describe('publishedMetaPayloadFromDoc', () => {
  it('reads published snapshot fields', () => {
    expect(
      publishedMetaPayloadFromDoc({
        meta: { title: 'draft', description: 'draft d' },
        publishedMeta: { title: 'live', description: 'live d' },
      }),
    ).toEqual({ title: 'live', description: 'live d' });
  });
});
