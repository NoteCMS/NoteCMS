import { describe, expect, it } from 'vitest';
import {
  generatePreviewBundleSecret,
  hashPreviewBundleSecret,
  verifyPreviewBundleSecret,
} from '../site/preview-bundle-token.js';

describe('preview bundle token', () => {
  it('verifies round-trip', () => {
    const secret = generatePreviewBundleSecret();
    expect(secret.length).toBeGreaterThan(10);
    const hash = hashPreviewBundleSecret(secret);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPreviewBundleSecret(secret, hash)).toBe(true);
    expect(verifyPreviewBundleSecret(secret + 'x', hash)).toBe(false);
    expect(verifyPreviewBundleSecret('', hash)).toBe(false);
  });
});
