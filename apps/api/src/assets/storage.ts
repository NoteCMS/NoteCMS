export interface StoragePutOptions {
  contentType: string;
  /** When set, stored on S3-compatible backends (immutable asset variants). */
  cacheControl?: string;
}

export interface StorageAdapter {
  put(key: string, data: Buffer, options: StoragePutOptions): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getDataUrl(key: string, contentType: string): Promise<string>;
  /** Public CDN URL when configured; null when only data URLs are available. */
  getPublicUrl(key: string): string | null;
}

export function normalizeStorageKey(input: string) {
  return input.replace(/[^a-zA-Z0-9_./-]/g, '_');
}

export const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';
