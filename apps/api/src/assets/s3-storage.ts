import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { buildPublicAssetUrl } from './public-url.js';
import { IMMUTABLE_ASSET_CACHE_CONTROL, StorageAdapter, StoragePutOptions } from './storage.js';

async function streamToBuffer(body: AsyncIterable<Uint8Array> | undefined): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class S3StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnBaseUrl: string;

  constructor() {
    const bucket = env.assetS3Bucket?.trim();
    const cdnBaseUrl = env.assetCdnBaseUrl?.trim();
    const accessKeyId = env.assetS3AccessKeyId?.trim();
    const secretAccessKey = env.assetS3SecretAccessKey?.trim();

    if (!bucket) throw new Error('ASSET_S3_BUCKET is required when ASSET_STORAGE_DRIVER=s3');
    if (!cdnBaseUrl) throw new Error('ASSET_CDN_BASE_URL is required when ASSET_STORAGE_DRIVER=s3');
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('ASSET_S3_ACCESS_KEY_ID and ASSET_S3_SECRET_ACCESS_KEY are required when ASSET_STORAGE_DRIVER=s3');
    }

    this.bucket = bucket;
    this.cdnBaseUrl = cdnBaseUrl;
    this.client = new S3Client({
      region: env.assetS3Region?.trim() || 'auto',
      endpoint: env.assetS3Endpoint?.trim() || undefined,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: env.assetS3ForcePathStyle,
    });
  }

  async put(key: string, data: Buffer, options: StoragePutOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: options.contentType,
        CacheControl: options.cacheControl ?? IMMUTABLE_ASSET_CACHE_CONTROL,
      }),
    );
  }

  async getBuffer(key: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    return streamToBuffer(out.Body as AsyncIterable<Uint8Array> | undefined);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getDataUrl(key: string, contentType: string): Promise<string> {
    const file = await this.getBuffer(key);
    return `data:${contentType};base64,${file.toString('base64')}`;
  }

  getPublicUrl(key: string): string | null {
    return buildPublicAssetUrl(this.cdnBaseUrl, key);
  }
}
