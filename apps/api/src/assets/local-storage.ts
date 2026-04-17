import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { StorageAdapter } from './storage.js';

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly rootPath: string) {}

  private resolve(key: string) {
    return path.join(this.rootPath, key);
  }

  async put(key: string, data: Buffer, _contentType?: string): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async getBuffer(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    const target = this.resolve(key);
    await rm(target, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async getDataUrl(key: string, contentType: string): Promise<string> {
    const file = await readFile(this.resolve(key));
    return `data:${contentType};base64,${file.toString('base64')}`;
  }
}
