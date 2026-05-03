import { describe, expect, it } from 'vitest';

describe('publish-webhook-crypto', () => {
  it('round-trips PAT when key is set', async () => {
    process.env.PUBLISH_WEBHOOK_ENCRYPTION_KEY = 'a'.repeat(64);
    const { encryptPublishPat, decryptPublishPat } = await import('../auth/publish-webhook-crypto.js');
    const secret = 'ghp_test_fake_classic_pat';
    const enc = encryptPublishPat(secret);
    expect(enc).not.toContain(secret);
    expect(decryptPublishPat(enc)).toBe(secret);
  });
});
