import type express from 'express';
import { getStorageAdapter } from '../assets/index.js';
import { mimeForDerivativeKey } from '../assets/image.js';
import { LOCAL_ASSET_HTTP_PREFIX } from '../assets/http-path.js';
import { env } from '../config/env.js';
import { IMMUTABLE_ASSET_CACHE_CONTROL } from '../assets/storage.js';

/** Serve local asset files when no CDN is configured (dev / self-host without R2). */
export async function localAssetHandler(req: express.Request, res: express.Response): Promise<void> {
  if (env.assetStorageDriver !== 'local') {
    res.status(404).json({ message: 'Not found' });
    return;
  }

  const prefix = `${LOCAL_ASSET_HTTP_PREFIX}/`;
  const rawPath = req.path.startsWith(prefix) ? req.path.slice(prefix.length) : '';
  if (!rawPath || rawPath.includes('..')) {
    res.status(400).json({ message: 'Invalid asset path' });
    return;
  }

  const key = decodeURIComponent(rawPath);
  const storage = getStorageAdapter();

  try {
    const buffer = await storage.getBuffer(key);
    const mime = mimeForDerivativeKey(key);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', IMMUTABLE_ASSET_CACHE_CONTROL);
    res.send(buffer);
  } catch {
    res.status(404).json({ message: 'Asset not found' });
  }
}
