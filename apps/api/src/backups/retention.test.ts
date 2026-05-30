import { describe, expect, it } from 'vitest';
import { retentionLimitForTier } from './retention.js';

describe('retentionLimitForTier', () => {
  it('returns default limits per tier', () => {
    expect(retentionLimitForTier('hourly')).toBe(24);
    expect(retentionLimitForTier('daily')).toBe(7);
    expect(retentionLimitForTier('weekly')).toBe(4);
    expect(retentionLimitForTier('manual')).toBe(5);
  });
});
