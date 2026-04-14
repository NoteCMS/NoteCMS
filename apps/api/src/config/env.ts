import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.API_PORT ?? 4000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27017/notecms',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  assetStorageDriver: (process.env.ASSET_STORAGE_DRIVER ?? 'local') as 'local' | 's3',
  assetLocalRoot: process.env.ASSET_LOCAL_ROOT ?? path.resolve(process.cwd(), 'data/assets'),
  assetMaxUploadBytes: Number(process.env.ASSET_MAX_UPLOAD_BYTES ?? 10_000_000),
};
