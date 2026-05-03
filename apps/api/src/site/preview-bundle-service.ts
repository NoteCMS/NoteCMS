import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { GridFSBucket, ObjectId } from 'mongodb';
import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { env } from '../config/env.js';
import { PreviewBundleModel } from '../db/models/PreviewBundle.js';
import { SiteSettingsModel } from '../db/models/SiteSettings.js';
import { exportFullSiteBundle } from './site-bundle-service.js';
import {
  generatePreviewBundleSecret,
  hashPreviewBundleSecret,
  verifyPreviewBundleSecret,
} from './preview-bundle-token.js';

const MIN_TTL_MINUTES = 5;
const GRIDFS_BUCKET = 'previewBundles';

export function buildPreviewBundleFetchUrl(publicId: string): string | null {
  const base = env.publicApiBaseUrl;
  if (!base) return null;
  return `${base}/api/preview/${encodeURIComponent(publicId)}`;
}

function sha256hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function gridFsUpload(buffer: Buffer): Promise<ObjectId> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const bucket = new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
  return new Promise<ObjectId>((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(`preview-${crypto.randomUUID()}.json`, {
      metadata: { purpose: 'preview-bundle' },
    });
    uploadStream.on('error', reject).on('finish', () => resolve(uploadStream.id));
    Readable.from(buffer).pipe(uploadStream).on('error', reject);
  });
}

export async function gridFsReadPreviewPayload(gridFsFileId: ObjectId): Promise<Buffer> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not connected');
  const bucket = new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
  const stream = bucket.openDownloadStream(gridFsFileId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function gridFsDelete(gridFsFileId: ObjectId): Promise<void> {
  try {
    const db = mongoose.connection.db;
    if (!db) return;
    const bucket = new GridFSBucket(db, { bucketName: GRIDFS_BUCKET });
    await bucket.delete(gridFsFileId);
  } catch {
    /* missing file */
  }
}

async function deletePreviewPayload(doc: {
  gridFsFileId?: unknown;
  payloadJson?: string | null;
}): Promise<void> {
  if (doc.gridFsFileId) {
    await gridFsDelete(doc.gridFsFileId as ObjectId);
  }
}

async function purgeExpiredForSite(siteId: string): Promise<void> {
  const expired = await PreviewBundleModel.find({
    siteId,
    expiresAt: { $lt: new Date() },
  }).lean();
  for (const row of expired) {
    await deletePreviewPayload(row);
    await PreviewBundleModel.deleteOne({ _id: row._id });
  }
}

async function countActiveForSite(siteId: string): Promise<number> {
  return PreviewBundleModel.countDocuments({
    siteId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
}

export type CreatePreviewBundleResult = {
  publicId: string;
  secretToken: string;
  expiresAt: Date;
  fetchUrl: string | null;
  fetchPath: string;
  contentSha256: string;
  sourceContentRevision: number | null;
};

export async function createPreviewBundleRecord(params: {
  siteId: string;
  userId: string;
  ttlMinutes: number;
  label?: string | null;
}): Promise<CreatePreviewBundleResult> {
  const maxTtl = Math.max(MIN_TTL_MINUTES, env.previewBundleMaxTtlMinutes);
  const ttl = Math.min(Math.max(MIN_TTL_MINUTES, Math.floor(params.ttlMinutes)), maxTtl);

  await purgeExpiredForSite(params.siteId);
  const active = await countActiveForSite(params.siteId);
  if (active >= env.maxActivePreviewBundlesPerSite) {
    throw new GraphQLError(
      `At most ${env.maxActivePreviewBundlesPerSite} active preview bundles per site. Revoke or wait for expiry.`,
      { extensions: { code: 'BAD_USER_INPUT', fieldPath: ['ttlMinutes'] } },
    );
  }

  const bundle = await exportFullSiteBundle(params.siteId);
  const json = JSON.stringify(bundle);
  const byteLength = Buffer.byteLength(json, 'utf8');
  const contentSha256 = sha256hex(json);
  const inlineMax = Math.max(256_000, env.previewBundleInlineMaxBytes);

  let payloadJson: string | null = null;
  let gridFsFileId: ObjectId | null = null;
  if (byteLength <= inlineMax) {
    payloadJson = json;
  } else {
    gridFsFileId = await gridFsUpload(Buffer.from(json, 'utf8'));
  }

  const secret = generatePreviewBundleSecret();
  const tokenHash = hashPreviewBundleSecret(secret);
  const publicId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ttl * 60_000);

  const settings = await SiteSettingsModel.findOne({ siteId: params.siteId }).select({ contentRevision: 1 }).lean();
  const sourceContentRevision =
    typeof settings?.contentRevision === 'number' && Number.isFinite(settings.contentRevision)
      ? settings.contentRevision
      : null;

  await PreviewBundleModel.create({
    siteId: params.siteId,
    publicId,
    tokenHash,
    expiresAt,
    createdByUserId: params.userId,
    label: typeof params.label === 'string' ? params.label.trim().slice(0, 200) || undefined : undefined,
    sourceContentRevision: sourceContentRevision ?? undefined,
    sha256: contentSha256,
    byteLength,
    gridFsFileId,
    payloadJson,
  });

  console.info('[preview-bundle] created', {
    siteId: params.siteId,
    publicId,
    byteLength,
    ttlMinutes: ttl,
    storage: gridFsFileId ? 'gridfs' : 'inline',
  });

  return {
    publicId,
    secretToken: secret,
    expiresAt,
    fetchUrl: buildPreviewBundleFetchUrl(publicId),
    fetchPath: `/api/preview/${publicId}`,
    contentSha256,
    sourceContentRevision,
  };
}

export type PreviewBundleListRow = {
  publicId: string;
  expiresAt: string;
  createdAt: string;
  label: string | null;
  revoked: boolean;
  expired: boolean;
  sourceContentRevision: number | null;
  byteLength: number;
  contentSha256: string;
};

export async function listPreviewBundlesForSite(siteId: string): Promise<PreviewBundleListRow[]> {
  await purgeExpiredForSite(siteId);
  const rows = await PreviewBundleModel.find({ siteId }).sort({ createdAt: -1 }).limit(50).lean();
  const now = Date.now();
  return rows.map((row) => {
    const exp = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
    const revoked = Boolean(row.revokedAt);
    const expired = !revoked && exp <= now;
    return {
      publicId: row.publicId,
      expiresAt: new Date(row.expiresAt).toISOString(),
      createdAt: new Date(row.createdAt).toISOString(),
      label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null,
      revoked,
      expired,
      sourceContentRevision:
        typeof row.sourceContentRevision === 'number' && Number.isFinite(row.sourceContentRevision)
          ? row.sourceContentRevision
          : null,
      byteLength: row.byteLength,
      contentSha256: row.sha256,
    };
  });
}

export async function revokePreviewBundleRecord(siteId: string, publicId: string): Promise<boolean> {
  const doc = await PreviewBundleModel.findOneAndUpdate(
    { siteId, publicId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  ).lean();
  return Boolean(doc);
}

export async function loadPreviewBundlePayload(
  publicId: string,
  bearerSecret: string,
): Promise<{ jsonUtf8: string; sha256: string } | null> {
  const doc = await PreviewBundleModel.findOne({ publicId }).lean();
  if (!doc) return null;
  if (doc.revokedAt) return null;
  if (doc.expiresAt && new Date(doc.expiresAt) <= new Date()) return null;
  if (!verifyPreviewBundleSecret(bearerSecret, doc.tokenHash)) return null;

  let jsonUtf8: string;
  if (doc.payloadJson != null && typeof doc.payloadJson === 'string') {
    jsonUtf8 = doc.payloadJson;
  } else if (doc.gridFsFileId) {
    const buf = await gridFsReadPreviewPayload(doc.gridFsFileId as ObjectId);
    jsonUtf8 = buf.toString('utf8');
  } else {
    return null;
  }

  return { jsonUtf8, sha256: doc.sha256 };
}
