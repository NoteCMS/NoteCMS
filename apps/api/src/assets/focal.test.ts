import { describe, expect, it } from 'vitest';
import { normalizeFocal01 } from './focal.js';

describe('normalizeFocal01', () => {
  it('clamps to 0–1 and defaults invalid values', () => {
    expect(normalizeFocal01(0.25)).toBe(0.25);
    expect(normalizeFocal01(1.5)).toBe(1);
    expect(normalizeFocal01(-0.1)).toBe(0);
    expect(normalizeFocal01('bad')).toBe(0.5);
  });
});
