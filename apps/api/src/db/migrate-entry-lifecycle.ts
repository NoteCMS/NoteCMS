import mongoose from 'mongoose';
import { EntryModel } from './models/Entry.js';
import { EntryRevisionModel } from './models/EntryRevision.js';

/**
 * One-time data + index migration for entry lifecycle and revision history.
 * Safe to run repeatedly: processes entries until all have `lastPublishedRevisionId`.
 */
export async function migrateEntryLifecycle(): Promise<void> {
  const coll = EntryModel.collection;
  for (const name of ['siteId_1_contentTypeId_1_slug_1', 'siteId_1_contentTypeId_1_name_1']) {
    try {
      await coll.dropIndex(name);
    } catch {
      // ignore missing
    }
  }
  await EntryModel.syncIndexes();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const doc = await EntryModel.findOne({
      $or: [{ lastPublishedRevisionId: { $exists: false } }, { lastPublishedRevisionId: null }],
    }).lean();
    if (!doc) break;

    const id = doc._id as mongoose.Types.ObjectId;
    const lifecycle = (doc as { lifecycleStatus?: string }).lifecycleStatus;
    const hasLifecycle = lifecycle === 'draft' || lifecycle === 'published';
    const publishedAt = (doc as { publishedAt?: Date }).publishedAt ?? doc.updatedAt ?? doc.createdAt;
    const name = typeof doc.name === 'string' ? doc.name : '';
    const slug = typeof doc.slug === 'string' ? doc.slug : null;
    const data = doc.data && typeof doc.data === 'object' && !Array.isArray(doc.data) ? doc.data : {};

    if (!hasLifecycle) {
      await EntryModel.updateOne(
        { _id: id },
        {
          $set: {
            lifecycleStatus: 'published',
            publishedAt,
            publishedName: name,
            publishedSlug: slug,
            publishedData: data,
            hasUnpublishedChanges: false,
            deletedAt: null,
            deletedBy: null,
          },
        },
      );
    }

    const fresh = await EntryModel.findById(id).lean();
    if (!fresh) continue;
    const rev = await EntryRevisionModel.create({
      entryId: id,
      siteId: fresh.siteId,
      revisionNumber: 1,
      createdBy: fresh.updatedBy ?? null,
      kind: 'migrate_initial',
      payload: {
        name: typeof fresh.name === 'string' ? fresh.name : '',
        slug: typeof fresh.slug === 'string' ? fresh.slug : null,
        data:
          fresh.data && typeof fresh.data === 'object' && !Array.isArray(fresh.data)
            ? (fresh.data as Record<string, unknown>)
            : {},
      },
      previousRevisionId: null,
    });
    await EntryModel.updateOne(
      { _id: id },
      {
        $set: {
          lastPublishedRevisionId: rev._id,
        },
      },
    );
  }
}
