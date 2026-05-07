import mongoose from 'mongoose';
import { EntryModel } from '../db/models/Entry.js';
import { EntryRevisionModel } from '../db/models/EntryRevision.js';

export type RevisionKind = 'migrate_initial' | 'draft_save' | 'publish' | 'rollback' | 'unpublish' | 'restore';

export async function getNextRevisionNumber(entryId: string): Promise<number> {
  const last = await EntryRevisionModel.findOne({ entryId }).sort({ revisionNumber: -1 }).select({ revisionNumber: 1 }).lean();
  return (last?.revisionNumber ?? 0) + 1;
}

export async function appendEntryRevision(params: {
  entryId: string;
  siteId: string;
  userId: string | null;
  kind: RevisionKind;
  payload: { name: string; slug: string | null; data: Record<string, unknown> };
  previousRevisionId?: string | null;
}): Promise<{ revisionId: string; revisionNumber: number }> {
  const entryOid = new mongoose.Types.ObjectId(params.entryId);
  const n = await getNextRevisionNumber(params.entryId);
  const doc = await EntryRevisionModel.create({
    entryId: entryOid,
    siteId: new mongoose.Types.ObjectId(params.siteId),
    revisionNumber: n,
    createdBy: params.userId ? new mongoose.Types.ObjectId(params.userId) : null,
    kind: params.kind,
    payload: params.payload,
    previousRevisionId: params.previousRevisionId
      ? new mongoose.Types.ObjectId(params.previousRevisionId)
      : null,
  });
  return { revisionId: String(doc._id), revisionNumber: n };
}

export async function listEntryRevisions(entryId: string, siteId: string, limit: number, offset: number) {
  const rows = await EntryRevisionModel.find({ entryId, siteId })
    .sort({ revisionNumber: -1 })
    .skip(offset)
    .limit(limit)
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    entryId: String(r.entryId),
    siteId: String(r.siteId),
    revisionNumber: r.revisionNumber,
    kind: r.kind,
    createdAt: new Date((r as { createdAt?: Date }).createdAt ?? Date.now()).toISOString(),
    createdById: r.createdBy ? String(r.createdBy) : null,
    payload: r.payload,
  }));
}

export async function getEntryRevision(revisionId: string, siteId: string) {
  const r = await EntryRevisionModel.findOne({ _id: revisionId, siteId }).lean();
  if (!r) return null;
  return {
    id: String(r._id),
    entryId: String(r.entryId),
    siteId: String(r.siteId),
    revisionNumber: r.revisionNumber,
    kind: r.kind,
    createdAt: new Date((r as { createdAt?: Date }).createdAt ?? Date.now()).toISOString(),
    createdById: r.createdBy ? String(r.createdBy) : null,
    payload: r.payload,
  };
}

/** Copy published snapshot from entry working fields and mark published. */
export async function applyPublishToEntry(
  entryId: string,
  siteId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const cur = await EntryModel.findOne({ _id: entryId, siteId }).lean();
  if (!cur) return null;
  const name = typeof cur.name === 'string' ? cur.name : '';
  const slug = typeof cur.slug === 'string' ? cur.slug : null;
  const data =
    cur.data && typeof cur.data === 'object' && !Array.isArray(cur.data) ? (cur.data as Record<string, unknown>) : {};

  const { revisionId } = await appendEntryRevision({
    entryId,
    siteId,
    userId,
    kind: 'publish',
    payload: { name, slug, data },
    previousRevisionId: cur.lastPublishedRevisionId ? String(cur.lastPublishedRevisionId) : null,
  });

  const publishedAt = new Date();
  await EntryModel.updateOne(
    { _id: entryId, siteId },
    {
      $set: {
        lifecycleStatus: 'published',
        publishedAt,
        publishedName: name,
        publishedSlug: slug,
        publishedData: data,
        hasUnpublishedChanges: false,
        lastPublishedRevisionId: new mongoose.Types.ObjectId(revisionId),
        scheduledPublishAt: null,
        scheduledUnpublishAt: null,
      },
    },
  );
  return await EntryModel.findOne({ _id: entryId, siteId }).lean();
}
