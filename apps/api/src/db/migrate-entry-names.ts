import { EntryModel } from './models/Entry.js';

/** Backfill `name` for legacy entries before unique index applies. Idempotent. */
export async function migrateEntryNames(): Promise<void> {
  const needsName = await EntryModel.find({
    $or: [{ name: { $exists: false } }, { name: null }, { name: '' }],
  })
    .select({ _id: 1, siteId: 1, contentTypeId: 1, slug: 1 })
    .lean();

  for (const doc of needsName) {
    const slugPart = doc.slug && String(doc.slug).trim() ? String(doc.slug).trim() : '';
    const base = slugPart || 'Untitled';
    let candidate = base;
    let n = 1;
    for (;;) {
      const clash = await EntryModel.findOne({
        siteId: doc.siteId,
        contentTypeId: doc.contentTypeId,
        name: candidate,
        _id: { $ne: doc._id },
      })
        .select({ _id: 1 })
        .lean();
      if (!clash) break;
      candidate = `${base} (${n})`;
      n += 1;
    }
    await EntryModel.updateOne({ _id: doc._id }, { $set: { name: candidate } });
  }
}
