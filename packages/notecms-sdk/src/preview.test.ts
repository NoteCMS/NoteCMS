import { describe, expect, it, vi } from 'vitest';
import {
  NOTECMS_PREVIEW_QUERY_ID,
  NOTECMS_PREVIEW_QUERY_TOKEN,
  buildUrlWithNoteCmsPreviewParams,
  fetchPreviewSiteBundle,
  parseNoteCmsPreviewQueryFromSearchParams,
} from './preview.js';

describe('preview query helpers', () => {
  it('buildUrlWithNoteCmsPreviewParams appends stable keys', () => {
    const url = buildUrlWithNoteCmsPreviewParams('https://example.com/about', 'pid-1', 'tok-2');
    expect(url).toContain(`${NOTECMS_PREVIEW_QUERY_ID}=pid-1`);
    expect(url).toContain(`${NOTECMS_PREVIEW_QUERY_TOKEN}=tok-2`);
  });

  it('parseNoteCmsPreviewQueryFromSearchParams reads both keys', () => {
    const sp = new URLSearchParams();
    sp.set(NOTECMS_PREVIEW_QUERY_ID, 'uuid-here');
    sp.set(NOTECMS_PREVIEW_QUERY_TOKEN, 'secret-here');
    expect(parseNoteCmsPreviewQueryFromSearchParams(sp)).toEqual({
      publicId: 'uuid-here',
      token: 'secret-here',
    });
    expect(parseNoteCmsPreviewQueryFromSearchParams(new URLSearchParams())).toBeNull();
  });
});

describe('fetchPreviewSiteBundle', () => {
  it('GETs bundle with Bearer token and returns sha header', async () => {
    const bundle = { version: 1 as const, exportedAt: '2026-01-01T00:00:00.000Z', siteId: '507f1f77bcf86cd799439011' };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(bundle), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-content-sha256': 'abc123',
          },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchPreviewSiteBundle('https://api.example.com', '550e8400-e29b-41d4-a716-446655440000', {
      token: 'secret',
    });

    expect(out.bundle).toEqual(bundle);
    expect(out.contentSha256).toBe('abc123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/preview/550e8400-e29b-41d4-a716-446655440000',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer secret' },
        cache: 'no-store',
      }),
    );

    vi.unstubAllGlobals();
  });
});
