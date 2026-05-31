import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { SiteBuildDispatchCallbackModel } from '../db/models/SiteBuildDispatchCallback.js';
import { buildSiteBuildHookPath } from '../http/site-build-hook-paths.js';
import { generateReturnWebhookToken, hashReturnWebhookToken } from './publish-webhook-token.js';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function dispatchCallbackTtlMs(): number {
  const hours = env.dispatchCallbackTtlHours;
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_TTL_MS;
  return hours * 60 * 60 * 1000;
}

export function buildDispatchCompletionCallbackUrl(
  siteId: string,
  plainToken: string,
  buildSlug?: string,
): string {
  const base = env.publicApiBaseUrl;
  if (!base) {
    throw new Error('PUBLIC_API_BASE_URL is not set; cannot build dispatch callback URL.');
  }
  const url = new URL(`${base}${buildSiteBuildHookPath(siteId, buildSlug)}`);
  url.searchParams.set('token', plainToken);
  return url.toString();
}

export async function createDispatchCallbackToken(params: {
  siteId: string;
  buildId?: string | null;
  buildSlug?: string;
}): Promise<{ callbackUrl: string; tokenId: string } | null> {
  if (!env.publicApiBaseUrl) return null;

  const siteOid = new mongoose.Types.ObjectId(params.siteId);
  const buildId =
    params.buildId && mongoose.Types.ObjectId.isValid(params.buildId)
      ? new mongoose.Types.ObjectId(params.buildId)
      : null;

  const token = generateReturnWebhookToken();
  const tokenHash = hashReturnWebhookToken(token);
  const expiresAt = new Date(Date.now() + dispatchCallbackTtlMs());

  const created = await SiteBuildDispatchCallbackModel.create({
    siteId: siteOid,
    buildId,
    tokenHash,
    expiresAt,
  });

  const callbackUrl = buildDispatchCompletionCallbackUrl(params.siteId, token, params.buildSlug);
  return { callbackUrl, tokenId: String(created._id) };
}

export async function deleteDispatchCallbackToken(tokenId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(tokenId)) return;
  await SiteBuildDispatchCallbackModel.deleteOne({ _id: tokenId, usedAt: null });
}

/** Atomically mark a one-time dispatch token as used. Returns true when valid and unused. */
export async function consumeDispatchCallbackToken(params: {
  siteId: string;
  token: string;
  buildId?: unknown;
}): Promise<boolean> {
  const hash = hashReturnWebhookToken(params.token);
  const siteOid = new mongoose.Types.ObjectId(params.siteId);
  const query: Record<string, unknown> = {
    siteId: siteOid,
    tokenHash: hash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  };

  if (params.buildId != null) {
    query.buildId = params.buildId;
  } else {
    query.buildId = null;
  }

  const updated = await SiteBuildDispatchCallbackModel.findOneAndUpdate(
    query,
    { $set: { usedAt: new Date() } },
    { new: true },
  ).lean();

  return Boolean(updated);
}
