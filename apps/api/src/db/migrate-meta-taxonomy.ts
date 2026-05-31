import { ContentTypeModel } from './models/ContentType.js';
import { EntryModel } from './models/Entry.js';
import { PAGES_CONTENT_TYPE_SLUG } from '../site/meta-taxonomy.js';

/** Enable meta taxonomy on pages content types and backfill empty entry meta objects. */
export async function migrateMetaTaxonomy(): Promise<void> {
  const pagesTypes = await ContentTypeModel.find({ slug: PAGES_CONTENT_TYPE_SLUG }).lean();
  for (const ct of pagesTypes) {
    const options =
      ct.options && typeof ct.options === 'object' && !Array.isArray(ct.options)
        ? { ...(ct.options as Record<string, unknown>) }
        : {};
    options.metaTaxonomy = { enabled: true };
    await ContentTypeModel.updateOne({ _id: ct._id }, { $set: { options } });
  }

  await EntryModel.updateMany(
    {
      $or: [{ meta: { $exists: false } }, { meta: null }],
    },
    {
      $set: {
        meta: { title: '', description: '' },
      },
    },
  );

  await EntryModel.updateMany(
    {
      lifecycleStatus: 'published',
      $or: [{ publishedMeta: { $exists: false } }, { publishedMeta: null }],
    },
    {
      $set: {
        publishedMeta: { title: null, description: null },
      },
    },
  );
}
