import { describe, expect, it } from 'vitest';
import {
  generateReturnWebhookToken,
  hashReturnWebhookToken,
  verifyReturnWebhookToken,
} from '../site/publish-webhook-token.js';

describe('publish-webhook-token', () => {
  it('accepts matching token', () => {
    const token = generateReturnWebhookToken();
    const hash = hashReturnWebhookToken(token);
    expect(verifyReturnWebhookToken(token, hash)).toBe(true);
  });

  it('rejects wrong token', () => {
    const token = generateReturnWebhookToken();
    const hash = hashReturnWebhookToken(token);
    expect(verifyReturnWebhookToken(`${token}x`, hash)).toBe(false);
  });

  it('rejects malformed hash', () => {
    expect(verifyReturnWebhookToken('abc', 'not-64-hex')).toBe(false);
  });
});
