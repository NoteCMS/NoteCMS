/**
 * Regenerate missing responsive derivatives (small, medium, xlarge) from each asset's original file.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-asset-variants.ts
 *   npx tsx src/scripts/backfill-asset-variants.ts --dry-run
 *   npx tsx src/scripts/backfill-asset-variants.ts --siteId=64abc...
 *   npx tsx src/scripts/backfill-asset-variants.ts --limit=50
 *
 * Requires ASSET_STORAGE_DRIVER=local (S3 must implement getBuffer first).
 */
import path from 'node:path';
import { Types } from 'mongoose';
import { getStorageAdapter } from '../assets/index.js';
import { buildImageVariants } from '../assets/image.js';
import { env } from '../config/env.js';
import { connectDb } from '../db/mongoose.js';
import { AssetModel } from '../db/models/Asset.js';

function parseArgs() {
  const raw = process.argv.slice(2);
  const dryRun = raw.includes('--dry-run');
  let siteId: string | undefined;
  let limit: number | undefined;
  for (const a of raw) {
    if (a.startsWith('--siteId=')) siteId = a.slice('--siteId='.length).trim() || undefined;
    if (a.startsWith('--limit=')) {
      const n = Number(a.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }
  return { dryRun, siteId, limit };
}

const { dryRun, siteId, limit } = parseArgs();

await connectDb();

if (env.assetStorageDriver !== 'local') {
  console.error('backfill-asset-variants: only local storage is supported (S3 needs getBuffer + object read).');
  process.exit(1);
}

const storage = getStorageAdapter();

const filter: Record<string, unknown> = {
  $or: [{ storageKeySmall: null }, { storageKeyMedium: null }, { storageKeyXlarge: null }],
};
if (siteId) {
  if (!Types.ObjectId.isValid(siteId)) {
    console.error(`Invalid --siteId: ${siteId}`);
    process.exit(1);
  }
  filter.siteId = new Types.ObjectId(siteId);
}

let q = AssetModel.find(filter).sort({ createdAt: 1 }).lean();
if (limit) q = q.limit(limit);
const assets = await q.exec();

if (!assets.length) {
  console.log('No assets need backfill (all have small, medium, and xlarge keys).');
  process.exit(0);
}

console.log(`${dryRun ? '[dry-run] ' : ''}Processing ${assets.length} asset(s)…`);

let updated = 0;
let errors = 0;

for (const asset of assets) {
  const id = String(asset._id);
  const prefix = path.posix.dirname(String(asset.storageKeyWeb).replace(/\\/g, '/'));

  const needsSmall = !asset.storageKeySmall;
  const needsMedium = !asset.storageKeyMedium;
  const needsXlarge = !asset.storageKeyXlarge;

  if (!needsSmall && !needsMedium && !needsXlarge) continue;

  try {
    const original = await storage.getBuffer(asset.storageKeyOriginal);
    const variants = await buildImageVariants(original, asset.mimeType);
    const ext = variants.derivativeExt;
    const derivativeMime = variants.derivativeMime;

    const smallKey = `${prefix}/small.${ext}`;
    const mediumKey = `${prefix}/medium.${ext}`;
    const xlargeKey = `${prefix}/xlarge.${ext}`;

    const $set: Record<string, string> = {};

    if (needsSmall) {
      if (!dryRun) await storage.put(smallKey, variants.small, derivativeMime);
      $set.storageKeySmall = smallKey;
    }
    if (needsMedium) {
      if (!dryRun) await storage.put(mediumKey, variants.medium, derivativeMime);
      $set.storageKeyMedium = mediumKey;
    }
    if (needsXlarge) {
      if (!dryRun) await storage.put(xlargeKey, variants.xlarge, derivativeMime);
      $set.storageKeyXlarge = xlargeKey;
    }

    if (!dryRun && Object.keys($set).length) {
      await AssetModel.updateOne({ _id: asset._id }, { $set });
    }

    const parts = [
      needsSmall ? 'small' : null,
      needsMedium ? 'medium' : null,
      needsXlarge ? 'xlarge' : null,
    ].filter(Boolean);
    console.log(`  ${id}: ${dryRun ? 'would write' : 'wrote'} ${parts.join(', ')}`);
    updated += 1;
  } catch (err) {
    errors += 1;
    console.error(`  ${id}: failed —`, err instanceof Error ? err.message : err);
  }
}

console.log(`Done. ${updated} asset(s) ${dryRun ? 'planned' : 'updated'}, ${errors} error(s).`);
process.exit(errors > 0 ? 1 : 0);
