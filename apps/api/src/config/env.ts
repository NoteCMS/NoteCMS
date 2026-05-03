import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

function computeTrustProxy(): boolean {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  /** Portless / Docker / nginx often set `X-Forwarded-For`; express-rate-limit requires `trust proxy` when that header is present. Default on in dev only. */
  return (process.env.NODE_ENV ?? 'development') !== 'production';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** `PORT` is set by tools like [portless](https://github.com/vercel-labs/portless); `API_PORT` overrides when set. */
  port: Number(process.env.API_PORT ?? process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/notecms',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  /** If set, API creates this admin on startup (no password until setInitialPassword). */
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || undefined,
  /** If set, setInitialPassword must include this value (optional extra lock on first-time password). */
  bootstrapSecret: process.env.BOOTSTRAP_SECRET?.trim() || undefined,
  assetStorageDriver: (process.env.ASSET_STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  assetLocalRoot: process.env.ASSET_LOCAL_ROOT ?? path.resolve(process.cwd(), 'data/assets'),
  assetMaxUploadBytes: Number(process.env.ASSET_MAX_UPLOAD_BYTES ?? 10_000_000),
  /** Max JSON body size for Express (GraphQL, MCP). Site bundle import may need more — override in deploy. */
  jsonBodyLimit: process.env.JSON_BODY_LIMIT?.trim() || '12mb',
  /** IP rate limit: max requests per window for POST /graphql (brute-force / DoS mitigation). */
  graphqlRateLimitMax: Number(process.env.GRAPHQL_RATE_LIMIT_MAX ?? 400),
  /** Window in ms for GraphQL rate limit (default 15 minutes). */
  graphqlRateLimitWindowMs: Number(process.env.GRAPHQL_RATE_LIMIT_WINDOW_MS ?? 900_000),
  mcpRateLimitMax: Number(process.env.MCP_RATE_LIMIT_MAX ?? 120),
  mcpRateLimitWindowMs: Number(process.env.MCP_RATE_LIMIT_WINDOW_MS ?? 900_000),
  /** When true, Express trusts `X-Forwarded-For` (required behind Portless/nginx for correct rate-limit client IPs). Set `TRUST_PROXY=0` to disable. */
  trustProxy: computeTrustProxy(),
  /**
   * Material for AES-256-GCM encrypting GitHub PATs (64 hex chars or any string — SHA-256 derived to 32 bytes).
   * If unset, **`JWT_SECRET` is used** so you normally only configure one secret; set `PUBLISH_WEBHOOK_ENCRYPTION_KEY`
   * only when you want PAT ciphertext isolated from JWT rotation.
   */
  get publishWebhookEncryptionKey(): string {
    const dedicated = process.env.PUBLISH_WEBHOOK_ENCRYPTION_KEY?.trim();
    if (dedicated) return dedicated;
    return process.env.JWT_SECRET ?? 'change-me';
  },
  /** Public API origin for build-callback URLs (no trailing slash), e.g. `https://api.example.com`. */
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '') || undefined,
  hooksRateLimitMax: Number(process.env.HOOKS_RATE_LIMIT_MAX ?? 120),
  hooksRateLimitWindowMs: Number(process.env.HOOKS_RATE_LIMIT_WINDOW_MS ?? 900_000),
  /** GET /api/preview/:publicId — bundle fetch rate limit per IP. */
  previewBundleRateLimitMax: Number(process.env.PREVIEW_BUNDLE_RATE_LIMIT_MAX ?? 120),
  previewBundleRateLimitWindowMs: Number(process.env.PREVIEW_BUNDLE_RATE_LIMIT_WINDOW_MS ?? 900_000),
  maxActivePreviewBundlesPerSite: Number(process.env.MAX_ACTIVE_PREVIEW_BUNDLES_PER_SITE ?? 10),
  previewBundleMaxTtlMinutes: Number(process.env.PREVIEW_BUNDLE_MAX_TTL_MINUTES ?? 10_080),
  /** Stored inline when JSON bytes are at or below this threshold; larger payloads use GridFS. */
  previewBundleInlineMaxBytes: Number(process.env.PREVIEW_BUNDLE_INLINE_MAX_BYTES ?? 12_582_912),
};
