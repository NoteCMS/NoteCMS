import path from 'node:path';
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

type RasterDerivativeFormat = 'png' | 'webp';

export type BuiltImageVariants = {
  width: number | null;
  height: number | null;
  /** File extension for derivative keys (e.g. webp, png, ico, svg). */
  derivativeExt: string;
  derivativeMime: string;
  thumbnail: Buffer;
  small: Buffer;
  medium: Buffer;
  large: Buffer;
  xlarge: Buffer;
};

const ICO_MIMES = new Set(['image/x-icon', 'image/vnd.microsoft.icon']);

function passthroughVariants(buf: Buffer, derivativeExt: string, derivativeMime: string): BuiltImageVariants {
  const b = Buffer.from(buf);
  return {
    width: null,
    height: null,
    derivativeExt,
    derivativeMime,
    thumbnail: b,
    small: b,
    medium: b,
    large: b,
    xlarge: b,
  };
}

async function buildRasterDerivatives(input: Buffer, mimeType: string): Promise<BuiltImageVariants> {
  const metadata = await sharp(input).metadata();
  const format: RasterDerivativeFormat = mimeType === 'image/png' ? 'png' : 'webp';

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
    derivativeExt: format === 'png' ? 'png' : 'webp',
    derivativeMime: format === 'png' ? 'image/png' : 'image/webp',
    thumbnail,
    small,
    medium,
    large,
    xlarge,
  };
}

export async function buildImageVariants(input: Buffer, mimeType: string): Promise<BuiltImageVariants> {
  const normalized = mimeType.trim().toLowerCase();

  if (ICO_MIMES.has(normalized)) {
    try {
      return await buildRasterDerivatives(input, normalized);
    } catch {
      return passthroughVariants(input, 'ico', 'image/x-icon');
    }
  }

  if (normalized === 'image/svg+xml') {
    try {
      return await buildRasterDerivatives(input, normalized);
    } catch {
      return passthroughVariants(input, 'svg', 'image/svg+xml');
    }
  }

  return buildRasterDerivatives(input, normalized);
}

/** When the browser omits `File.type`, infer a supported image mime from the filename. */
export function resolveUploadMimeType(mimeType: string, filename: string): string {
  const m = mimeType.trim().toLowerCase();
  if (m && m !== 'application/octet-stream') return m;
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.ico') return 'image/x-icon';
  return m || mimeType;
}

export function mimeForDerivativeKey(storageKey: string) {
  const lower = storageKey.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.ico')) return 'image/x-icon';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/webp';
}

export function sanitizeFilename(filename: string) {
  const normalized = filename.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const trimmed = normalized.replace(/^-+|-+$/g, '').slice(0, 180);
  return trimmed || 'asset';
}
