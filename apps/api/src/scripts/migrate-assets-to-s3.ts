/**
 * Upload existing local asset files to S3/R2.
 *
 * Usage:
 *   ASSET_STORAGE_DRIVER=s3 ASSET_CDN_BASE_URL=... ASSET_S3_*=... \
 *     npx tsx src/scripts/migrate-assets-to-s3.ts
 *   npx tsx src/scripts/migrate-assets-to-s3.ts --dry-run
 *   npx tsx src/scripts/migrate-assets-to-s3.ts --siteId=64abc...
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Types } from 'mongoose';
import { getStorageAdapter } from '../assets/index.js';
import { mimeForDerivativeKey } from '../assets/image.js';
import { env } from '../config/env.js';
import { connectDb } from '../db/mongoose.js';
import { AssetModel } from '../db/models/Asset.js';
import { IMMUTABLE_ASSET_CACHE_CONTROL } from '../assets/storage.js';

function parseArgs() {
  const raw = process.argv.slice(2);
  const dryRun = raw.includes('--dry-run');
  let siteId: string | undefined;
  for (const a of raw) {
    if (a.startsWith('--siteId=')) siteId = a.slice('--siteId='.length).trim() || undefined;
  }
  return { dryRun, siteId };
}

const { dryRun, siteId } = parseArgs();

if (env.assetStorageDriver !== 's3') {
  console.error('Set ASSET_STORAGE_DRIVER=s3 and configure ASSET_S3_* + ASSET_CDN_BASE_URL before migrating.');
  process.exit(1);
}

await connectDb();

const localRoot = path.resolve(env.assetLocalRoot);
const storage = getStorageAdapter();

const filter: Record<string, unknown> = {};
if (siteId) {
  if (!Types.ObjectId.isValid(siteId)) {
    console.error(`Invalid --siteId: ${siteId}`);
    process.exit(1);
  }
  filter.siteId = new Types.ObjectId(siteId);
}

const assets = await AssetModel.find(filter).sort({ createdAt: 1 }).lean();
if (!assets.length) {
  console.log('No assets to migrate.');
  process.exit(0);
}

console.log(`${dryRun ? '[dry-run] ' : ''}Migrating ${assets.length} asset(s) from ${localRoot} to object storage…`);

let uploaded = 0;
let skipped = 0;
let errors = 0;

for (const asset of assets) {
  const id = String(asset._id);
  const keys = [
    asset.storageKeyOriginal,
    asset.storageKeyWeb,
    asset.storageKeyThumb,
    asset.storageKeySmall,
    asset.storageKeyMedium,
    asset.storageKeyXlarge,
  ].filter((key): key is string => Boolean(key));

  for (const key of keys) {
    const localPath = path.join(localRoot, key);
    try {
      await stat(localPath);
    } catch {
      console.warn(`  ${id}: missing local file ${key}, skipping`);
      skipped += 1;
      continue;
    }

    try {
      const exists = await storage.exists(key);
      if (exists) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        console.log(`  ${id}: would upload ${key}`);
        uploaded += 1;
        continue;
      }
      const buffer = await readFile(localPath);
      const contentType =
        key === asset.storageKeyOriginal ? asset.mimeType : mimeForDerivativeKey(key);
      await storage.put(key, buffer, {
        contentType,
        cacheControl: IMMUTABLE_ASSET_CACHE_CONTROL,
      });
      uploaded += 1;
    } catch (err) {
      errors += 1;
      console.error(`  ${id}: failed ${key} —`, err instanceof Error ? err.message : err);
    }
  }
}

console.log(`Done. ${uploaded} file(s) ${dryRun ? 'planned' : 'uploaded'}, ${skipped} skipped, ${errors} error(s).`);
process.exit(errors > 0 ? 1 : 0);
