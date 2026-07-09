import { describe, expect, it } from 'vitest';
import { hashEmailToken } from '../auth/email-tokens.js';

describe('hashEmailToken', () => {
  it('returns a stable hex digest for the same token', () => {
    const a = hashEmailToken('abc123');
    const b = hashEmailToken('abc123');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs for different tokens', () => {
    expect(hashEmailToken('one')).not.toBe(hashEmailToken('two'));
  });
});
