import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SiteBuildModel } from '../db/models/SiteBuild.js';
import { SiteSettingsModel } from '../db/models/SiteSettings.js';
import { parseLastPublishedWatermarkFromDetail } from '../site/publish-watermark-detail.js';
import { verifyReturnWebhookToken } from '../site/publish-webhook-token.js';
import {
  consumeDispatchCallbackToken,
  findUnusedDispatchCallback,
} from '../site/dispatch-callback-token.js';
import { ensureLegacySiteBuildMigrated } from '../site/site-build-service.js';

const ALLOWED_STATUS = new Set(['success', 'failure', 'cancelled']);
const MAX_BODY_BYTES = 32_000;
const MAX_DETAIL_JSON = 8_000;

function extractBearer(req: Request): string {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const q = req.query.token;
  if (typeof q === 'string') return q.trim();
  return '';
}

function capJsonPayload(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    const s = JSON.stringify(value);
    if (s.length <= MAX_DETAIL_JSON) return value;
    return { _truncated: true, preview: s.slice(0, MAX_DETAIL_JSON) };
  } catch {
    return { _invalid: true };
  }
}

type CallbackTarget =
  | { kind: 'legacy-settings'; siteId: string }
  | { kind: 'site-build'; siteId: string; buildId: unknown };

type ResolvedCallback = {
  target: CallbackTarget;
  /** When set, the request matched a one-time dispatch token from triggerSiteBuild. */
  dispatch: { buildId: unknown | null } | null;
};

async function resolveCallbackTarget(siteId: string, token: string, buildSlug?: string): Promise<ResolvedCallback | null> {
  if (!mongoose.Types.ObjectId.isValid(siteId)) return null;

  const dispatch = await findUnusedDispatchCallback(siteId, token);
  if (dispatch?.buildId) {
    return {
      target: { kind: 'site-build', siteId, buildId: dispatch.buildId },
      dispatch,
    };
  }

  const siteOid = new mongoose.Types.ObjectId(siteId);
  if (buildSlug) {
    await ensureLegacySiteBuildMigrated(siteId);
    const slug = buildSlug.trim().toLowerCase();
    const build = await SiteBuildModel.findOne({ siteId: siteOid, slug }).select({ _id: 1 }).lean();
    if (!build) return null;
    return {
      target: { kind: 'site-build', siteId, buildId: build._id },
      dispatch,
    };
  }

  return {
    target: { kind: 'legacy-settings', siteId },
    dispatch,
  };
}

async function matchStaticBuildToken(siteId: string, token: string): Promise<unknown | null> {
  await ensureLegacySiteBuildMigrated(siteId);
  const builds = await SiteBuildModel.find({ siteId: new mongoose.Types.ObjectId(siteId) })
    .select({ _id: 1, publishReturnTokenHash: 1 })
    .lean();
  for (const build of builds) {
    const hash = typeof build.publishReturnTokenHash === 'string' ? build.publishReturnTokenHash.trim() : '';
    if (hash && verifyReturnWebhookToken(token, hash)) return build._id;
  }
  return null;
}

async function verifyCallbackToken(target: CallbackTarget, token: string, dispatch: ResolvedCallback['dispatch']): Promise<boolean> {
  if (dispatch) return true;

  if (target.kind === 'site-build') {
    const build = await SiteBuildModel.findById(target.buildId).select({ publishReturnTokenHash: 1 }).lean();
    const hash =
      build && typeof build.publishReturnTokenHash === 'string' ? build.publishReturnTokenHash.trim() : '';
    return Boolean(hash && verifyReturnWebhookToken(token, hash));
  }

  const doc = await SiteSettingsModel.findOne({ siteId: new mongoose.Types.ObjectId(target.siteId) })
    .select({ publishReturnTokenHash: 1 })
    .lean();
  const hash = doc && typeof doc.publishReturnTokenHash === 'string' ? doc.publishReturnTokenHash.trim() : '';
  if (hash && verifyReturnWebhookToken(token, hash)) return true;

  await ensureLegacySiteBuildMigrated(target.siteId);
  const builds = await SiteBuildModel.find({ siteId: new mongoose.Types.ObjectId(target.siteId) })
    .select({ publishReturnTokenHash: 1 })
    .lean();
  return builds.some((b) => {
    const h = typeof b.publishReturnTokenHash === 'string' ? b.publishReturnTokenHash.trim() : '';
    return Boolean(h && verifyReturnWebhookToken(token, h));
  });
}

async function persistCallbackResult(target: CallbackTarget, body: Record<string, unknown>): Promise<void> {
  const statusRaw = typeof body.status === 'string' ? body.status : '';
  const status = statusRaw.trim().toLowerCase();
  const runUrlRaw = body.runUrl;
  const runUrl = typeof runUrlRaw === 'string' ? runUrlRaw.trim().slice(0, 2000) : '';
  const detail = body.detail;
  const publishLastReturnPayload = detail !== undefined ? capJsonPayload(detail) : null;

  const baseSet: Record<string, unknown> = {
    publishLastReturnAt: new Date(),
    publishLastReturnStatus: status,
    publishLastReturnRunUrl: runUrl || null,
    publishLastReturnPayload,
  };

  if (status === 'success') {
    const watermark = parseLastPublishedWatermarkFromDetail(detail);
    if (watermark) baseSet.lastPublishedWatermark = watermark;
  }

  if (target.kind === 'site-build') {
    await SiteBuildModel.updateOne({ _id: target.buildId }, { $set: baseSet });
    return;
  }

  await SiteSettingsModel.updateOne({ siteId: new mongoose.Types.ObjectId(target.siteId) }, { $set: baseSet });
}

/**
 * GitHub Actions (or any runner) POSTs here when a build finishes.
 * No JWT — verified by per-build or per-site bearer token (hashed at rest).
 */
export async function siteBuildCallbackHandler(req: Request, res: Response, buildSlug?: string): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Allow', 'POST').end();
    return;
  }

  const siteId = typeof req.params.siteId === 'string' ? req.params.siteId.trim() : '';
  if (!siteId || !mongoose.Types.ObjectId.isValid(siteId)) {
    res.status(404).end();
    return;
  }

  const cl = req.headers['content-length'];
  if (cl !== undefined) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      res.status(413).json({ message: 'Request body too large' });
      return;
    }
  }

  const token = extractBearer(req);
  if (!token) {
    res.status(404).end();
    return;
  }

  const resolved = await resolveCallbackTarget(siteId, token, buildSlug);
  if (!resolved) {
    res.status(404).end();
    return;
  }

  const { target: initialTarget, dispatch } = resolved;
  let target = initialTarget;
  if (!(await verifyCallbackToken(target, token, dispatch))) {
    res.status(404).end();
    return;
  }

  if (target.kind === 'legacy-settings') {
    const staticBuildId = await matchStaticBuildToken(siteId, token);
    if (staticBuildId) {
      target = { kind: 'site-build', siteId, buildId: staticBuildId };
    }
  }

  const body = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ message: 'JSON object body required' });
    return;
  }

  const statusRaw = typeof (body as { status?: unknown }).status === 'string' ? (body as { status: string }).status : '';
  const status = statusRaw.trim().toLowerCase();
  if (!ALLOWED_STATUS.has(status)) {
    res.status(400).json({ message: 'status must be success, failure, or cancelled' });
    return;
  }

  await persistCallbackResult(target, body as Record<string, unknown>);

  if (dispatch) {
    await consumeDispatchCallbackToken({
      siteId,
      token,
      buildId: dispatch.buildId ?? undefined,
    });
  }

  res.status(204).end();
}
