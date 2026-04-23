import type { CorsOptions } from 'cors';
import { env } from './env.js';

/**
 * Production: set `CORS_ORIGINS` to a comma-separated list of allowed browser origins
 * (e.g. `https://cms.example.com,https://admin.example.com`). Requests with no `Origin`
 * (same-origin reverse proxy, curl) are still allowed.
 */
export function buildCorsOptions(): CorsOptions {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw) {
    const allowed = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
    const origin: CorsOptions['origin'] = (requestOrigin, cb) => {
      if (!requestOrigin) {
        cb(null, true);
        return;
      }
      cb(null, allowed.has(requestOrigin));
    };
    return { origin, credentials: true, allowedHeaders: corsAllowedHeaders };
  }

  if (env.nodeEnv !== 'production') {
    return {
      origin: true,
      credentials: true,
      allowedHeaders: corsAllowedHeaders,
    };
  }

  console.warn(
    '[api] CORS_ORIGINS is not set in production. Browser clients on another origin will be blocked. Set a comma-separated list of allowed origins.',
  );
  return {
    origin: false,
    credentials: true,
    allowedHeaders: corsAllowedHeaders,
  };
}

const corsAllowedHeaders = ['Content-Type', 'Authorization', 'X-Api-Key', 'mcp-session-id', 'Mcp-Session-Id'];
