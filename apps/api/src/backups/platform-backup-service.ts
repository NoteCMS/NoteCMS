import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { retentionLimitForTier } from './retention.js';
import {
  deleteBackupBlob,
  ensureBackupRoot,
  platformBackupAssetsKey,
  platformBackupMongoKey,
  readBackupBlob,
} from './storage.js';
import type { BackupTier, BackupTrigger } from './types.js';
import { PlatformBackupModel, type PlatformBackupDoc } from '../db/models/PlatformBackup.js';
import { setPlatformMaintenanceMode } from '../db/models/PlatformState.js';
import { assertMongoDbToolsAvailable, isMongoDbToolsAvailable } from './mongodb-tools.js';

let platformBackupRunning = false;

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${cmd} exited with code ${String(code)}`));
    });
  });
}

function toPlatformBackupGql(doc: PlatformBackupDoc) {
  return {
    id: String(doc._id),
    tier: doc.tier,
    trigger: doc.trigger,
    status: doc.status,
    label: doc.label ?? null,
    createdByUserId: doc.createdByUserId ? String(doc.createdByUserId) : null,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    sizeBytes: doc.sizeBytes,
    errorMessage: doc.errorMessage ?? null,
    mongoVersion: doc.mongoVersion ?? null,
  };
}

export async function listPlatformBackups(limit = 50, offset = 0) {
  const rows = await PlatformBackupModel.find({})
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(Math.min(limit, 100))
    .lean();
  return rows.map((r) => toPlatformBackupGql(r as PlatformBackupDoc));
}

export async function prunePlatformBackups(tier: BackupTier): Promise<void> {
  const keep = retentionLimitForTier(tier);
  const rows = await PlatformBackupModel.find({ tier, status: 'completed' })
    .sort({ createdAt: -1 })
    .skip(keep)
    .lean();
  for (const row of rows) {
    await deletePlatformBackup(String(row._id));
  }
}

async function pruneManualPlatformBackups(): Promise<void> {
  const keep = retentionLimitForTier('manual');
  const rows = await PlatformBackupModel.find({ tier: 'manual', status: 'completed' })
    .sort({ createdAt: -1 })
    .skip(keep)
    .lean();
  for (const row of rows) {
    await deletePlatformBackup(String(row._id));
  }
}

export async function deletePlatformBackup(backupId: string): Promise<boolean> {
  const doc = await PlatformBackupModel.findById(backupId).lean();
  if (!doc) return false;
  await deleteBackupBlob(doc.mongoArchiveKey);
  if (doc.assetsArchiveKey) await deleteBackupBlob(doc.assetsArchiveKey);
  await PlatformBackupModel.deleteOne({ _id: backupId });
  return true;
}

export async function createPlatformBackup(opts: {
  tier: BackupTier;
  trigger: BackupTrigger;
  userId?: string;
  label?: string;
}): Promise<ReturnType<typeof toPlatformBackupGql>> {
  if (platformBackupRunning) throw new Error('Another platform backup is already running');
  const running = await PlatformBackupModel.findOne({ status: 'running' }).lean();
  if (running) throw new Error('A platform backup is already running');

  const backupId = new mongoose.Types.ObjectId();
  const mongoKey = platformBackupMongoKey(String(backupId));
  const assetsKey = platformBackupAssetsKey(String(backupId));

  const doc = await PlatformBackupModel.create({
    _id: backupId,
    tier: opts.tier,
    trigger: opts.trigger,
    status: 'running',
    label: opts.label?.trim() || undefined,
    createdByUserId: opts.userId ? new mongoose.Types.ObjectId(opts.userId) : undefined,
    mongoArchiveKey: mongoKey,
    assetsArchiveKey: assetsKey,
  });

  platformBackupRunning = true;
  try {
    await ensureBackupRoot();
    const mongoAbs = path.join(env.backupLocalRoot, mongoKey);
    const assetsAbs = path.join(env.backupLocalRoot, assetsKey);
    await mkdir(path.dirname(mongoAbs), { recursive: true });
    await mkdir(path.dirname(assetsAbs), { recursive: true });

    await runCommand(env.mongodumpBin, ['--uri', env.mongoUri, `--archive=${mongoAbs}`, '--gzip']);

    await mkdir(env.assetLocalRoot, { recursive: true });
    await runCommand('tar', ['-czf', assetsAbs, '-C', env.assetLocalRoot, '.']);

    const mongoStat = await readFile(mongoAbs);
    const assetsStat = await readFile(assetsAbs);
    const totalSize = mongoStat.byteLength + assetsStat.byteLength;

    const updated = await PlatformBackupModel.findOneAndUpdate(
      { _id: backupId },
      { $set: { status: 'completed', completedAt: new Date(), sizeBytes: totalSize } },
      { new: true },
    ).lean();

    await prunePlatformBackups(opts.tier);
    if (opts.tier === 'manual') await pruneManualPlatformBackups();
    return toPlatformBackupGql(updated as PlatformBackupDoc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Platform backup failed';
    await PlatformBackupModel.updateOne({ _id: backupId }, { $set: { status: 'failed', errorMessage: message } });
    throw err;
  } finally {
    platformBackupRunning = false;
  }
}

export async function restorePlatformBackup(backupId: string, confirmId: string): Promise<{ ok: true }> {
  if (confirmId !== backupId) throw new Error('Confirmation id does not match backup id');
  const doc = await PlatformBackupModel.findOne({ _id: backupId, status: 'completed' }).lean();
  if (!doc) throw new Error('Backup not found or not completed');

  await setPlatformMaintenanceMode(true, 'Platform restore in progress');
  const tmpDir = path.join(env.backupLocalRoot, '_tmp', `restore-${backupId}`);
  await mkdir(tmpDir, { recursive: true });
  try {
    const mongoTmp = path.join(tmpDir, 'mongo.archive.gz');
    const assetsTmp = path.join(tmpDir, 'assets.tar.gz');
    const mongoBuf = await readBackupBlob(doc.mongoArchiveKey);
    await writeFile(mongoTmp, mongoBuf);
    await runCommand(env.mongorestoreBin, ['--uri', env.mongoUri, `--archive=${mongoTmp}`, '--gzip', '--drop']);

    if (doc.assetsArchiveKey) {
      const assetsBuf = await readBackupBlob(doc.assetsArchiveKey);
      await writeFile(assetsTmp, assetsBuf);
      await mkdir(env.assetLocalRoot, { recursive: true });
      await runCommand('tar', ['-xzf', assetsTmp, '-C', env.assetLocalRoot]);
    }
    return { ok: true };
  } finally {
    await setPlatformMaintenanceMode(false);
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function runScheduledPlatformBackup(tier: BackupTier): Promise<void> {
  if (!env.platformBackupEnabled) return;
  if (!(await isMongoDbToolsAvailable())) {
    console.warn(
      '[backup] skipping platform backup: mongodump/mongorestore not found (install mongodb-database-tools, set PLATFORM_BACKUP_ENABLED=false, or use Docker)',
    );
    return;
  }
  try {
    await createPlatformBackup({ tier, trigger: 'scheduled' });
  } catch (err) {
    console.error(`[backup] platform tier ${tier} failed:`, err);
  }
}

export function isPlatformBackupRunning(): boolean {
  return platformBackupRunning;
}
