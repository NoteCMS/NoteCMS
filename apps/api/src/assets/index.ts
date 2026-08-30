import { env } from '../config/env.js';
import { LOCAL_ASSET_HTTP_PREFIX } from './http-path.js';
import { LocalStorageAdapter } from './local-storage.js';
import { S3StorageAdapter } from './s3-storage.js';
import { usePublicAssetUrls } from './public-url.js';
import { StorageAdapter } from './storage.js';

let adapter: StorageAdapter | null = null;

function resolveLocalPublicBaseUrl(): string | undefined {
  const cdn = env.assetCdnBaseUrl?.trim();
  if (cdn) return cdn.replace(/\/$/, '');

  const explicit = env.assetPublicBaseUrl?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const apiBase = env.publicApiBaseUrl?.trim();
  // Under `/api/assets` so same-origin Caddy configs that already proxy `/api/*` work,
  // and so we do not collide with the SPA's Vite build files at `/assets/*`.
  if (apiBase) return `${apiBase.replace(/\/$/, '')}${LOCAL_ASSET_HTTP_PREFIX}`;

  return undefined;
}

export function getStorageAdapter(): StorageAdapter {
  if (adapter) return adapter;

  if (env.assetStorageDriver === 's3') {
    adapter = new S3StorageAdapter();
    return adapter;
  }

  adapter = new LocalStorageAdapter(env.assetLocalRoot, resolveLocalPublicBaseUrl());
  return adapter;
}

export function assetDeliveryUsesPublicUrls(): boolean {
  return usePublicAssetUrls(env.assetCdnBaseUrl ?? resolveLocalPublicBaseUrl());
}

/** Call after env changes in tests. */
export function resetStorageAdapterForTests(): void {
  adapter = null;
}
