import { env } from '../config/env.js';
import { LocalStorageAdapter } from './local-storage.js';
import { S3StorageAdapter } from './s3-storage.js';
import { StorageAdapter } from './storage.js';

let adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (adapter) return adapter;

  if (env.assetStorageDriver === 's3') {
    adapter = new S3StorageAdapter();
    return adapter;
  }

  adapter = new LocalStorageAdapter(env.assetLocalRoot);
  return adapter;
}
