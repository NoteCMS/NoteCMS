import { describe, expect, it, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';

vi.mock('../config/env.js', () => ({
  env: {
    publicApiBaseUrl: 'https://cms.example.com',
    dispatchCallbackTtlHours: 168,
  },
}));

const createMock = vi.fn();
const findOneAndUpdateMock = vi.fn();
const deleteOneMock = vi.fn();

vi.mock('../db/models/SiteBuildDispatchCallback.js', () => ({
  SiteBuildDispatchCallbackModel: {
    create: (...args: unknown[]) => createMock(...args),
    findOneAndUpdate: (...args: unknown[]) => ({
      lean: () => findOneAndUpdateMock(...args),
    }),
    deleteOne: (...args: unknown[]) => deleteOneMock(...args),
  },
}));

import {
  buildDispatchCompletionCallbackUrl,
  consumeDispatchCallbackToken,
  createDispatchCallbackToken,
} from '../site/dispatch-callback-token.js';
import { hashReturnWebhookToken } from '../site/publish-webhook-token.js';

describe('dispatch callback token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });
    deleteOneMock.mockResolvedValue({ deletedCount: 1 });
  });

  it('builds a full callback URL with token', () => {
    const url = buildDispatchCompletionCallbackUrl('507f1f77bcf86cd799439011', 'abc123', 'production');
    expect(url).toBe(
      'https://cms.example.com/api/hooks/site-build/507f1f77bcf86cd799439011/production?token=abc123',
    );
  });

  it('creates a dispatch token record and returns callback URL', async () => {
    const siteId = String(new mongoose.Types.ObjectId());
    const buildId = String(new mongoose.Types.ObjectId());
    const result = await createDispatchCallbackToken({ siteId, buildId, buildSlug: 'staging' });
    expect(result?.callbackUrl).toContain('/api/hooks/site-build/');
    expect(result?.callbackUrl).toContain('token=');
    expect(createMock).toHaveBeenCalledOnce();
  });

  it('consumes a one-time token atomically', async () => {
    const siteId = String(new mongoose.Types.ObjectId());
    const buildId = new mongoose.Types.ObjectId();
    const token = 'a'.repeat(64);
    findOneAndUpdateMock.mockResolvedValue({ _id: 'used' });

    const ok = await consumeDispatchCallbackToken({ siteId, token, buildId });
    expect(ok).toBe(true);
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        siteId: expect.any(mongoose.Types.ObjectId),
        tokenHash: hashReturnWebhookToken(token),
        buildId,
        usedAt: null,
      }),
      { $set: { usedAt: expect.any(Date) } },
      { new: true },
    );
  });
});
