import { describe, expect, it } from 'vitest';
import { parseLastPublishedWatermarkFromDetail } from '../site/publish-watermark-detail.js';

describe('parseLastPublishedWatermarkFromDetail', () => {
  it('returns null for non-objects', () => {
    expect(parseLastPublishedWatermarkFromDetail(null)).toBeNull();
    expect(parseLastPublishedWatermarkFromDetail(undefined)).toBeNull();
    expect(parseLastPublishedWatermarkFromDetail('x')).toBeNull();
    expect(parseLastPublishedWatermarkFromDetail([])).toBeNull();
  });

  it('extracts known fields', () => {
    expect(
      parseLastPublishedWatermarkFromDetail({
        contentRevision: 42,
        bundleHash: 'abc'.repeat(50),
        builtAt: '2026-01-01T00:00:00Z',
        workflowRunId: 'run-123',
      }),
    ).toEqual({
      contentRevision: 42,
      bundleHash: 'abc'.repeat(50).slice(0, 128),
      builtAt: '2026-01-01T00:00:00Z',
      workflowRunId: 'run-123',
    });
  });

  it('returns null when object has no recognized keys', () => {
    expect(parseLastPublishedWatermarkFromDetail({ foo: 1 })).toBeNull();
  });
});
