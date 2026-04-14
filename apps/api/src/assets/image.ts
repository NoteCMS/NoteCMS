import sharp from 'sharp';

export async function buildImageVariants(input: Buffer, mimeType: string) {
  const source = sharp(input);
  const metadata = await source.metadata();

  const format = mimeType === 'image/png' ? 'png' : 'webp';

  const web = await sharp(input)
    .resize({ width: 1600, withoutEnlargement: true })
    .toFormat(format, { quality: 85 })
    .toBuffer();

  const thumbnail = await sharp(input)
    .resize({ width: 320, withoutEnlargement: true })
    .toFormat(format, { quality: 80 })
    .toBuffer();

  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    web,
    thumbnail,
  };
}

export function sanitizeFilename(filename: string) {
  const normalized = filename.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return normalized.replace(/-+/g, '-');
}
