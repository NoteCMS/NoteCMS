import sharp from 'sharp';

/**
 * Standard responsive widths (max width, `withoutEnlargement` so smaller sources are not upscaled).
 * `web` in the API corresponds to `large`.
 */
export const ASSET_VARIANT_MAX_WIDTH = {
  thumbnail: 320,
  small: 480,
  medium: 960,
  large: 1600,
  xlarge: 2560,
} as const;

export type AssetDerivativeFormat = 'png' | 'webp';

export type BuiltImageVariants = {
  width: number | null;
  height: number | null;
  format: AssetDerivativeFormat;
  thumbnail: Buffer;
  small: Buffer;
  medium: Buffer;
  large: Buffer;
  xlarge: Buffer;
};

export async function buildImageVariants(input: Buffer, mimeType: string): Promise<BuiltImageVariants> {
  const metadata = await sharp(input).metadata();
  const format: AssetDerivativeFormat = mimeType === 'image/png' ? 'png' : 'webp';

  const encode = async (width: number, quality: number) => {
    const pipeline = sharp(input).resize({ width, withoutEnlargement: true });
    return pipeline.toFormat(format, { quality }).toBuffer();
  };

  const [thumbnail, small, medium, large, xlarge] = await Promise.all([
    encode(ASSET_VARIANT_MAX_WIDTH.thumbnail, 80),
    encode(ASSET_VARIANT_MAX_WIDTH.small, 85),
    encode(ASSET_VARIANT_MAX_WIDTH.medium, 85),
    encode(ASSET_VARIANT_MAX_WIDTH.large, 85),
    encode(ASSET_VARIANT_MAX_WIDTH.xlarge, 85),
  ]);

  return {
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format,
    thumbnail,
    small,
    medium,
    large,
    xlarge,
  };
}

export function derivativeFileExtension(format: AssetDerivativeFormat) {
  return format === 'png' ? 'png' : 'webp';
}

export function mimeForDerivativeKey(storageKey: string) {
  return storageKey.endsWith('.png') ? 'image/png' : 'image/webp';
}

export function sanitizeFilename(filename: string) {
  const normalized = filename.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const trimmed = normalized.replace(/^-+|-+$/g, '').slice(0, 180);
  return trimmed || 'asset';
}
