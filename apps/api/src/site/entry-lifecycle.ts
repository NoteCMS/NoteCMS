import type { RequestContext } from '../auth/types.js';
import { apiKeyHasScope } from '../auth/api-key-scopes.js';
import mongoose from 'mongoose';
import { EntryModel } from '../db/models/Entry.js';
import { appendEntryRevision } from './entry-revision-service.js';
import { fireContentWebhook } from './content-webhook.js';

export type EntryLifecycleStatus = 'draft' | 'published';

/** API keys without `entries:draft:read` only see published snapshots in `name`/`slug`/`data`. */
export function entryReadUsesPublishedSnapshot(ctx: RequestContext): boolean {
  if (!ctx.apiKey) return false;
  return !apiKeyHasScope(ctx.apiKey.scopes, 'entries:draft:read');
}

export function isEntrySoftDeleted(doc: { deletedAt?: Date | null }): boolean {
  return doc.deletedAt != null;
}

export function shouldHideEntryForSchedule(doc: {
  scheduledPublishAt?: Date | null;
  lifecycleStatus?: string | null;
}): boolean {
  if (doc.lifecycleStatus !== 'draft') return false;
  const sp = doc.scheduledPublishAt;
  if (!sp) return false;
  return new Date(sp).getTime() > Date.now();
}

/** Published consumer list / slug lookup: published lifecycle, not deleted, schedule not hiding draft. */
export function entryMatchesPublishedConsumerFilter(doc: Record<string, unknown>): boolean {
  if (isEntrySoftDeleted(doc as { deletedAt?: Date | null })) return false;
  if (doc.lifecycleStatus !== 'published') return false;
  if (shouldHideEntryForSchedule(doc as { scheduledPublishAt?: Date | null; lifecycleStatus?: string | null }))
    return false;
  return true;
}

export function resolveEntryPayloadForReader(
  doc: Record<string, unknown>,
  ctx: RequestContext,
): { name: string; slug: string | null; data: Record<string, unknown> } {
  if (entryReadUsesPublishedSnapshot(ctx)) {
    const st = doc.lifecycleStatus as string | undefined;
    if (st !== 'published') {
      return { name: '', slug: null, data: {} };
    }
    const pn = doc.publishedName;
    const ps = doc.publishedSlug;
    const pd = doc.publishedData;
    return {
      name: typeof pn === 'string' ? pn : '',
      slug: typeof ps === 'string' || ps === null ? (ps as string | null) : null,
      data: pd && typeof pd === 'object' && !Array.isArray(pd) ? (pd as Record<string, unknown>) : {},
    };
  }
  return {
    name: typeof doc.name === 'string' ? doc.name : '',
    slug: (doc.slug as string | null) ?? null,
    data: (doc.data && typeof doc.data === 'object' && !Array.isArray(doc.data) ? doc.data : {}) as Record<string, unknown>,
  };
}

/** Auto-publish drafts whose `scheduledPublishAt` is due (lazy, per-request). */
export async function activateScheduledEntries(siteId: string): Promise<number> {
  const now = new Date();
  const due = await EntryModel.find({
    siteId,
    lifecycleStatus: 'draft',
    scheduledPublishAt: { $lte: now },
    deletedAt: null,
  }).lean();

  let activated = 0;
  for (const row of due) {
    const id = String(row._id);
    const name = typeof row.name === 'string' ? row.name : '';
    const slug = typeof row.slug === 'string' ? row.slug : null;
    const data =
      row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
    const clash = await EntryModel.findOne({
      siteId,
      contentTypeId: row.contentTypeId,
      publishedSlug: slug,
      lifecycleStatus: 'published',
      deletedAt: null,
      _id: { $ne: row._id },
    })
      .select({ _id: 1 })
      .lean();
    if (slug && clash) continue;

    activated += 1;
    const { revisionId } = await appendEntryRevision({
      entryId: id,
      siteId,
      userId: null,
      kind: 'publish',
      payload: { name, slug, data },
      previousRevisionId: row.lastPublishedRevisionId ? String(row.lastPublishedRevisionId) : null,
    });

    await EntryModel.updateOne(
      { _id: row._id },
      {
        $set: {
          lifecycleStatus: 'published',
          publishedAt: now,
          publishedName: name,
          publishedSlug: slug,
          publishedData: data,
          hasUnpublishedChanges: false,
          lastPublishedRevisionId: new mongoose.Types.ObjectId(revisionId),
          scheduledPublishAt: null,
        },
      },
    );
  }

  const unpublishDue = await EntryModel.find({
    siteId,
    lifecycleStatus: 'published',
    scheduledUnpublishAt: { $lte: now },
    deletedAt: null,
  }).lean();

  for (const row of unpublishDue) {
    const id = String(row._id);
    const p = {
      name: typeof row.publishedName === 'string' ? row.publishedName : String(row.name ?? ''),
      slug: typeof row.publishedSlug === 'string' || row.publishedSlug === null ? (row.publishedSlug as string | null) : null,
      data:
        row.publishedData && typeof row.publishedData === 'object' && !Array.isArray(row.publishedData)
          ? (row.publishedData as Record<string, unknown>)
          : {},
    };
    const { revisionId } = await appendEntryRevision({
      entryId: id,
      siteId,
      userId: null,
      kind: 'unpublish',
      payload: p,
      previousRevisionId: row.lastPublishedRevisionId ? String(row.lastPublishedRevisionId) : null,
    });
    await EntryModel.updateOne(
      { _id: row._id },
      {
        $set: {
          lifecycleStatus: 'draft',
          publishedAt: null,
          publishedName: null,
          publishedSlug: null,
          publishedData: null,
          hasUnpublishedChanges: false,
          scheduledUnpublishAt: null,
          lastPublishedRevisionId: new mongoose.Types.ObjectId(revisionId),
        },
      },
    );
    void fireContentWebhook('entry.unpublished', { siteId, entryId: id, scheduled: true });
    activated += 1;
  }

  return activated;
}
