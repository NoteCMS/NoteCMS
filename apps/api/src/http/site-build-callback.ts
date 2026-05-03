import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SiteSettingsModel } from '../db/models/SiteSettings.js';
import { verifyReturnWebhookToken } from '../site/publish-webhook-token.js';

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

/**
 * GitHub Actions (or any runner) POSTs here when a build finishes.
 * No JWT — verified by per-site bearer token (hashed at rest).
 */
export async function siteBuildCallbackHandler(req: Request, res: Response): Promise<void> {
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

  const doc = await SiteSettingsModel.findOne({ siteId }).select({ publishReturnTokenHash: 1 }).lean();
  const hash =
    doc && typeof doc.publishReturnTokenHash === 'string' ? doc.publishReturnTokenHash.trim() : '';
  if (!hash || !verifyReturnWebhookToken(token, hash)) {
    res.status(404).end();
    return;
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

  const runUrlRaw = (body as { runUrl?: unknown }).runUrl;
  const runUrl = typeof runUrlRaw === 'string' ? runUrlRaw.trim().slice(0, 2000) : '';

  const detail = (body as { detail?: unknown }).detail;
  const publishLastReturnPayload = detail !== undefined ? capJsonPayload(detail) : null;

  await SiteSettingsModel.updateOne(
    { siteId },
    {
      $set: {
        publishLastReturnAt: new Date(),
        publishLastReturnStatus: status,
        publishLastReturnRunUrl: runUrl || null,
        publishLastReturnPayload,
      },
    },
  );

  res.status(204).end();
}
