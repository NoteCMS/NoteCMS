import { describe, expect, it, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';
import {
  generateReturnWebhookToken,
  hashReturnWebhookToken,
} from '../site/publish-webhook-token.js';

const siteId = new mongoose.Types.ObjectId();
const buildId = new mongoose.Types.ObjectId();
const token = generateReturnWebhookToken();
const tokenHash = hashReturnWebhookToken(token);

const findOneBuild = vi.fn();
const findByIdBuild = vi.fn();
const updateOneBuild = vi.fn();
const findOneSettings = vi.fn();
const findBuilds = vi.fn();
const updateOneSettings = vi.fn();
const ensureMigrated = vi.fn();
const consumeDispatchToken = vi.fn();

vi.mock('../site/dispatch-callback-token.js', () => ({
  consumeDispatchCallbackToken: (...args: unknown[]) => consumeDispatchToken(...args),
}));

vi.mock('../db/models/SiteBuild.js', () => ({
  SiteBuildModel: {
    findOne: (...args: unknown[]) => ({ select: () => ({ lean: () => findOneBuild(...args) }) }),
    findById: (...args: unknown[]) => ({ select: () => ({ lean: () => findByIdBuild(...args) }) }),
    updateOne: (...args: unknown[]) => updateOneBuild(...args),
    find: (...args: unknown[]) => ({ select: () => ({ lean: () => findBuilds(...args) }) }),
  },
}));

vi.mock('../db/models/SiteSettings.js', () => ({
  SiteSettingsModel: {
    findOne: (...args: unknown[]) => ({ select: () => ({ lean: () => findOneSettings(...args) }) }),
    updateOne: (...args: unknown[]) => updateOneSettings(...args),
  },
}));

vi.mock('../site/site-build-service.js', () => ({
  ensureLegacySiteBuildMigrated: (...args: unknown[]) => ensureMigrated(...args),
}));

import { siteBuildCallbackHandler } from '../http/site-build-callback.js';

function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as Response['status'];
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as Response['json'];
  res.setHeader = vi.fn(() => res as Response);
  res.end = vi.fn(() => res as Response);
  return res as Response & { statusCode?: number; body?: unknown };
}

describe('siteBuildCallbackHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMigrated.mockResolvedValue(undefined);
    findOneBuild.mockResolvedValue({ _id: buildId });
    findByIdBuild.mockResolvedValue({ publishReturnTokenHash: tokenHash });
    updateOneBuild.mockResolvedValue({ acknowledged: true });
    consumeDispatchToken.mockResolvedValue(true);
  });

  it('accepts POST on /api/hooks path with token query param', async () => {
    const req = {
      method: 'POST',
      params: { siteId: String(siteId), buildSlug: 'staging' },
      query: { token },
      headers: {},
      body: { status: 'success', runUrl: 'https://github.com/org/repo/actions/runs/1' },
    } as unknown as Request;
    const res = mockRes();

    await siteBuildCallbackHandler(req, res, 'staging');

    expect(res.statusCode).toBe(204);
    expect(consumeDispatchToken).toHaveBeenCalledWith({
      siteId: String(siteId),
      token,
      buildId,
    });
    expect(updateOneBuild).toHaveBeenCalled();
  });

  it('falls back to static build token when dispatch token is not found', async () => {
    consumeDispatchToken.mockResolvedValue(false);
    const req = {
      method: 'POST',
      params: { siteId: String(siteId), buildSlug: 'staging' },
      query: { token },
      headers: {},
      body: { status: 'success' },
    } as unknown as Request;
    const res = mockRes();

    await siteBuildCallbackHandler(req, res, 'staging');

    expect(res.statusCode).toBe(204);
    expect(findByIdBuild).toHaveBeenCalled();
  });

  it('returns 404 when token is missing', async () => {
    const req = {
      method: 'POST',
      params: { siteId: String(siteId), buildSlug: 'staging' },
      query: {},
      headers: {},
      body: { status: 'success' },
    } as unknown as Request;
    const res = mockRes();

    await siteBuildCallbackHandler(req, res, 'staging');

    expect(res.statusCode).toBe(404);
  });

  it('returns 405 for GET', async () => {
    const req = {
      method: 'GET',
      params: { siteId: String(siteId), buildSlug: 'staging' },
      query: { token },
      headers: {},
      body: {},
    } as unknown as Request;
    const res = mockRes();

    await siteBuildCallbackHandler(req, res, 'staging');

    expect(res.statusCode).toBe(405);
  });
});
