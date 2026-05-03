import { SiteSettingsModel } from '../db/models/SiteSettings.js';

/** Bump after mutations that change exportable site state (entries, types, settings, assets, bundle import). */
export async function bumpSiteContentRevision(siteId: string): Promise<void> {
  await SiteSettingsModel.updateOne(
    { siteId },
    { $inc: { contentRevision: 1 }, $setOnInsert: { siteId } },
    { upsert: true },
  );
}
