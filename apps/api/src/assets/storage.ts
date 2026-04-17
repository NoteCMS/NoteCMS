export type AssetVariant = 'original' | 'web' | 'thumbnail' | 'small' | 'medium' | 'large' | 'xlarge';

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getDataUrl(key: string, contentType: string): Promise<string>;
}

export function normalizeStorageKey(input: string) {
  return input.replace(/[^a-zA-Z0-9_./-]/g, '_');
}
