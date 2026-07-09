import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRootEnv = path.resolve(__dirname, '../../../..', '.env');
dotenv.config({ path: repoRootEnv });
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
  mcpRateLimitUnauthMax: Number(process.env.MCP_RATE_LIMIT_UNAUTH_MAX ?? 60),
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
  /** Hours until an unused dispatch completion token expires (default 168 = 7 days). */
  dispatchCallbackTtlHours: Number(process.env.DISPATCH_CALLBACK_TTL_HOURS ?? 168),
  /** When set, POST JSON `{ event, idempotencyKey, at, ...payload }` on entry publish/unpublish/delete/restore/rollback. */
  contentWebhookUrl: process.env.CONTENT_WEBHOOK_URL?.trim() || undefined,
  /** Optional HMAC-SHA256 secret; when set, `X-NoteCMS-Signature: sha256=<hex>` is sent for the raw body. */
  contentWebhookSecret: process.env.CONTENT_WEBHOOK_SECRET?.trim() || undefined,

  backupLocalRoot: process.env.BACKUP_LOCAL_ROOT?.trim() || path.resolve(process.cwd(), 'data/backups'),
  backupSchedulerEnabled: (process.env.BACKUP_SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false',
  /** Off in dev by default — needs mongodump on PATH; Docker API image includes mongodb-tools. */
  platformBackupEnabled: (() => {
    const raw = process.env.PLATFORM_BACKUP_ENABLED?.trim().toLowerCase();
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    return (process.env.NODE_ENV ?? 'development') === 'production';
  })(),
  mongodumpBin: process.env.MONGODUMP_BIN?.trim() || 'mongodump',
  mongorestoreBin: process.env.MONGORESTORE_BIN?.trim() || 'mongorestore',
  backupCronHourly: process.env.BACKUP_CRON_HOURLY?.trim() || '0 * * * *',
  backupCronDaily: process.env.BACKUP_CRON_DAILY?.trim() || '0 3 * * *',
  backupCronWeekly: process.env.BACKUP_CRON_WEEKLY?.trim() || '0 4 * * 0',
  backupRetentionHourly: Number(process.env.BACKUP_RETENTION_HOURLY ?? 24),
  backupRetentionDaily: Number(process.env.BACKUP_RETENTION_DAILY ?? 7),
  backupRetentionWeekly: Number(process.env.BACKUP_RETENTION_WEEKLY ?? 4),
  backupRetentionManual: Number(process.env.BACKUP_RETENTION_MANUAL ?? 5),

  /** When true, outbound email (password reset, invites) is allowed if SMTP is configured. */
  mailEnabled: (process.env.MAIL_ENABLED ?? 'false').toLowerCase() === 'true',
  smtpHost: process.env.SMTP_HOST?.trim() || undefined,
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
  smtpUser: process.env.SMTP_USER?.trim() || undefined,
  smtpPass: process.env.SMTP_PASS?.trim() || undefined,
  mailFrom: process.env.MAIL_FROM?.trim() || undefined,
  /** Public admin UI origin (no trailing slash) for links in email. Set on API when mail is enabled. */
  publicUrl: process.env.PUBLIC_URL?.trim().replace(/\/$/, '') || undefined,
  mailTokenTtlResetMinutes: Number(process.env.MAIL_TOKEN_TTL_RESET_MINUTES ?? 60),
  mailTokenTtlInviteHours: Number(process.env.MAIL_TOKEN_TTL_INVITE_HOURS ?? 168),
  mailRateLimitMax: Number(process.env.MAIL_RATE_LIMIT_MAX ?? 3),
  mailRateLimitWindowMs: Number(process.env.MAIL_RATE_LIMIT_WINDOW_MS ?? 3_600_000),
};
