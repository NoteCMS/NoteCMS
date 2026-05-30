import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

function resolveKey(key: string): string {
  return path.join(env.backupLocalRoot, key);
}

export async function ensureBackupRoot(): Promise<void> {
  await mkdir(env.backupLocalRoot, { recursive: true });
}

export async function writeBackupBlob(storageKey: string, data: Buffer | string): Promise<number> {
  await ensureBackupRoot();
  const target = resolveKey(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  await writeFile(target, buf);
  return buf.byteLength;
}

export async function readBackupBlob(storageKey: string): Promise<Buffer> {
  return readFile(resolveKey(storageKey));
}

export async function readBackupJson<T>(storageKey: string): Promise<T> {
  const raw = await readBackupBlob(storageKey);
  return JSON.parse(raw.toString('utf8')) as T;
}

export async function deleteBackupBlob(storageKey: string): Promise<void> {
  await rm(resolveKey(storageKey), { force: true, recursive: true });
}

export async function backupBlobSize(storageKey: string): Promise<number> {
  try {
    const s = await stat(resolveKey(storageKey));
    return s.size;
  } catch {
    return 0;
  }
}

export function siteBackupStorageKey(siteId: string, backupId: string): string {
  return `sites/${siteId}/${backupId}/bundle.json`;
}

export function platformBackupMongoKey(backupId: string): string {
  return `platform/${backupId}/mongo.archive.gz`;
}

export function platformBackupAssetsKey(backupId: string): string {
  return `platform/${backupId}/assets.tar.gz`;
}
