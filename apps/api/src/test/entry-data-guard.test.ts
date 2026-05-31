import { describe, expect, it } from 'vitest';
import {
  assertPublishPreservesContent,
  countEntryBlocks,
  entryDataIsEmpty,
  hashEntryData,
  sanitizeEntryUpdateInput,
} from '../site/entry-data-guard.js';

describe('entryDataIsEmpty', () => {
  it('treats empty blocks as empty', () => {
    expect(entryDataIsEmpty({ blocks: [] })).toBe(true);
    expect(entryDataIsEmpty({ blocks: [{ type: 'p', text: 'hi' }] })).toBe(false);
  });

  it('treats null and {} as empty', () => {
    expect(entryDataIsEmpty(null)).toBe(true);
    expect(entryDataIsEmpty({})).toBe(true);
  });
});

describe('sanitizeEntryUpdateInput', () => {
  it('strips nullish keys', () => {
    expect(sanitizeEntryUpdateInput({ name: 'Page', slug: null })).toEqual({ name: 'Page' });
  });

  it('rejects explicit data null', () => {
    expect(() => sanitizeEntryUpdateInput({ data: null })).toThrow(/Cannot set entry data to null/i);
  });
});

describe('assertPublishPreservesContent', () => {
  it('blocks publishing empty draft over live content', () => {
    expect(() =>
      assertPublishPreservesContent({
        lifecycleStatus: 'published',
        publishedData: { blocks: [{ id: '1' }] },
        data: { blocks: [] },
      }),
    ).toThrow(/Refusing to publish/i);
  });

  it('allows first publish and unchanged republish', () => {
    expect(() =>
      assertPublishPreservesContent({
        lifecycleStatus: 'draft',
        publishedData: null,
        data: { blocks: [] },
      }),
    ).not.toThrow();

    expect(() =>
      assertPublishPreservesContent({
        lifecycleStatus: 'published',
        publishedData: { blocks: [{ id: '1' }] },
        data: { blocks: [{ id: '1' }] },
      }),
    ).not.toThrow();
  });
});

describe('hashEntryData', () => {
  it('is stable for the same payload', () => {
    const data = { blocks: [{ id: 'a' }] };
    expect(hashEntryData(data)).toBe(hashEntryData(data));
  });
});

describe('countEntryBlocks', () => {
  it('returns blocks length when present', () => {
    expect(countEntryBlocks({ blocks: [1, 2] })).toBe(2);
    expect(countEntryBlocks({ title: 'x' })).toBeNull();
  });
});
