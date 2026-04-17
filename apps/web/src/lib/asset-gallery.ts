import type { Asset } from '@/types/app';

/** Readable primary label + optional file hint (storage names are often long hashes). */
export function assetGalleryLabels(asset: Asset): { primary: string; hint?: string; title: string } {
  const full = asset.filename;
  const titled = asset.title?.trim();
  const ext = full.includes('.') ? full.slice(full.lastIndexOf('.')) : '';
  const base = ext ? full.slice(0, -ext.length) : full;

  const shortenFile =
    base.length > 22 || (base.length > 14 && /^[a-f0-9]+$/i.test(base))
      ? `${base.slice(0, 8)}…${ext}`
      : full;

  if (titled) {
    return {
      primary: titled,
      hint: shortenFile !== titled ? shortenFile : undefined,
      title: `${titled} (${full})`,
    };
  }
  return { primary: shortenFile, title: full };
}
