import type { Request, Response } from 'express';
import { loadPreviewBundlePayload } from '../site/preview-bundle-service.js';
import { env } from '../config/env.js';

function extractBearer(req: Request): string {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const q = req.query.token;
  if (typeof q === 'string') return q.trim();
  return '';
}

export async function previewBundleGetHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).setHeader('Allow', 'GET').end();
    return;
  }

  const publicId = typeof req.params.publicId === 'string' ? req.params.publicId.trim() : '';
  if (!publicId) {
    res.status(404).end();
    return;
  }

  const token = extractBearer(req);
  if (!token) {
    res.status(401).setHeader('WWW-Authenticate', 'Bearer').json({ message: 'Authorization Bearer token required' });
    return;
  }

  try {
    const payload = await loadPreviewBundlePayload(publicId, token);
    if (!payload) {
      res.status(404).end();
      return;
    }

    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Cache-Control', 'private, no-store')
      .setHeader('X-Content-SHA256', payload.sha256);
    if (env.nodeEnv !== 'production') {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    res.send(payload.jsonUtf8);
  } catch (err) {
    console.error('[api/preview]', err);
    if (!res.headersSent) {
      res.status(500).json({ message: env.nodeEnv === 'production' ? 'Internal server error' : String(err) });
    }
  }
}
