import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

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
};
