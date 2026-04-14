import { StorageAdapter } from './storage.js';

export class S3StorageAdapter implements StorageAdapter {
  async put(): Promise<void> {
    throw new Error('S3 storage adapter is not implemented yet');
  }

  async delete(): Promise<void> {
    throw new Error('S3 storage adapter is not implemented yet');
  }

  async exists(): Promise<boolean> {
    throw new Error('S3 storage adapter is not implemented yet');
  }

  async getDataUrl(): Promise<string> {
    throw new Error('S3 storage adapter is not implemented yet');
  }
}
