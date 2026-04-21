import { env } from '../config/env.js';
import { AssetModel } from '../db/models/Asset.js';
import { buildImageVariants, resolveUploadMimeType, sanitizeFilename } from './image.js';
import { LocalStorageAdapter } from './local-storage.js';
import { S3StorageAdapter } from './s3-storage.js';
import type { StorageAdapter } from './storage.js';
import { normalizeStorageKey } from './storage.js';

let adapter: StorageAdapter | null = null;

function getAdapter(): StorageAdapter {
  if (adapter) return adapter;
  if (env.assetStorageDriver === 's3') {
    adapter = new S3StorageAdapter();
    return adapter;
  }
  adapter = new LocalStorageAdapter(env.assetLocalRoot);
  return adapter;
}

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

/** Persist an uploaded image (same pipeline as GraphQL uploadAsset). Returns new asset id. */
export async function persistImageUpload(params: {
  siteId: string;
  userId: string;
  fileBase64: string;
  filename: string;
  mimeType: string;
  alt?: string;
  title?: string;
}): Promise<string> {
  const { siteId, userId, fileBase64, filename, mimeType, alt = '', title = '' } = params;
  const original = Buffer.from(fileBase64, 'base64');
  if (!original.byteLength) throw new Error('Empty upload');
  if (original.byteLength > env.assetMaxUploadBytes) throw new Error('Upload exceeds file size limit');

  const safeFilename = sanitizeFilename(filename || 'asset');
  const effectiveMime = resolveUploadMimeType(String(mimeType ?? ''), safeFilename);
  if (!ALLOWED_MIMES.has(effectiveMime)) throw new Error('Unsupported mime type');

  const keyPrefix = normalizeStorageKey(`${siteId}/${Date.now()}-${safeFilename}`);
  const storage = getAdapter();
  const variants = await buildImageVariants(original, effectiveMime);
  const ext = variants.derivativeExt;
  const derivativeMime = variants.derivativeMime;

  const originalKey = `${keyPrefix}/original`;
  const thumbKey = `${keyPrefix}/thumbnail.${ext}`;
  const smallKey = `${keyPrefix}/small.${ext}`;
  const mediumKey = `${keyPrefix}/medium.${ext}`;
  const webKey = `${keyPrefix}/large.${ext}`;
  const xlargeKey = `${keyPrefix}/xlarge.${ext}`;

  await storage.put(originalKey, original, effectiveMime);
  await storage.put(thumbKey, variants.thumbnail, derivativeMime);
  await storage.put(smallKey, variants.small, derivativeMime);
  await storage.put(mediumKey, variants.medium, derivativeMime);
  await storage.put(webKey, variants.large, derivativeMime);
  await storage.put(xlargeKey, variants.xlarge, derivativeMime);

  const asset = await AssetModel.create({
    siteId,
    uploadedBy: userId,
    filename: safeFilename,
    mimeType: effectiveMime,
    sizeBytes: original.byteLength,
    width: variants.width,
    height: variants.height,
    alt,
    title,
    storageKeyOriginal: originalKey,
    storageKeyWeb: webKey,
    storageKeyThumb: thumbKey,
    storageKeySmall: smallKey,
    storageKeyMedium: mediumKey,
    storageKeyXlarge: xlargeKey,
  });

  return String(asset._id);
}
