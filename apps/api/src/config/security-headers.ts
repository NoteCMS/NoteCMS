import helmet from 'helmet';
import { env } from './env.js';

/**
 * HTTP hardening for the JSON/MCP API. CSP is disabled here — the admin SPA sets its own CSP.
 * `cross-origin` CORP allows browser clients on another origin to read responses when CORS allows it.
 */
export function apiSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity:
      env.nodeEnv === 'production'
        ? { maxAge: 15_552_000, includeSubDomains: true, preload: false }
        : false,
  });
}
