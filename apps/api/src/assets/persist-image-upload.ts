import { env } from '../config/env.js';
import { AssetModel } from '../db/models/Asset.js';
import { normalizeFocal01 } from './focal.js';
import { buildImageVariants, resolveUploadMimeType, sanitizeFilename } from './image.js';
import { getStorageAdapter } from './index.js';
import { normalizeStorageKey } from './storage.js';

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
  focalX?: number;
  focalY?: number;
}): Promise<string> {
  const {
    siteId,
    userId,
    fileBase64,
    filename,
    mimeType,
    alt = '',
    title = '',
    focalX,
    focalY,
  } = params;
  const original = Buffer.from(fileBase64, 'base64');
  if (!original.byteLength) throw new Error('Empty upload');
  if (original.byteLength > env.assetMaxUploadBytes) throw new Error('Upload exceeds file size limit');

  const safeFilename = sanitizeFilename(filename || 'asset');
  const effectiveMime = resolveUploadMimeType(String(mimeType ?? ''), safeFilename);
  if (!ALLOWED_MIMES.has(effectiveMime)) throw new Error('Unsupported mime type');

  const keyPrefix = normalizeStorageKey(`${siteId}/${Date.now()}-${safeFilename}`);
  const storage = getStorageAdapter();
  const variants = await buildImageVariants(original, effectiveMime);
  const ext = variants.derivativeExt;
  const derivativeMime = variants.derivativeMime;

  const originalKey = `${keyPrefix}/original`;
  const thumbKey = `${keyPrefix}/thumbnail.${ext}`;
  const smallKey = `${keyPrefix}/small.${ext}`;
  const mediumKey = `${keyPrefix}/medium.${ext}`;
  const webKey = `${keyPrefix}/large.${ext}`;
  const xlargeKey = `${keyPrefix}/xlarge.${ext}`;

  await storage.put(originalKey, original, { contentType: effectiveMime });
  await storage.put(thumbKey, variants.thumbnail, { contentType: derivativeMime });
  await storage.put(smallKey, variants.small, { contentType: derivativeMime });
  await storage.put(mediumKey, variants.medium, { contentType: derivativeMime });
  await storage.put(webKey, variants.large, { contentType: derivativeMime });
  await storage.put(xlargeKey, variants.xlarge, { contentType: derivativeMime });

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
    focalX: normalizeFocal01(focalX),
    focalY: normalizeFocal01(focalY),
    storageKeyOriginal: originalKey,
    storageKeyWeb: webKey,
    storageKeyThumb: thumbKey,
    storageKeySmall: smallKey,
    storageKeyMedium: mediumKey,
    storageKeyXlarge: xlargeKey,
  });

  return String(asset._id);
}
