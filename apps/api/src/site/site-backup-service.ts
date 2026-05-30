import mongoose from 'mongoose';
import { retentionLimitForTier } from '../backups/retention.js';
import {
  deleteBackupBlob,
  readBackupJson,
  siteBackupStorageKey,
  writeBackupBlob,
} from '../backups/storage.js';
import type { BackupTier, BackupTrigger } from '../backups/types.js';
import { SiteBackupModel, type SiteBackupDoc } from '../db/models/SiteBackup.js';
import { SiteSettingsModel } from '../db/models/SiteSettings.js';
import { SiteModel } from '../db/models/Site.js';
import { bumpSiteContentRevision } from './content-revision.js';
import {
  exportSiteBackupBundle,
  replaceSiteFromBundle,
  resolveFullSiteBundleExportOptions,
} from './site-bundle-service.js';

let siteBackupRunning = false;

export function isSiteBackupRunning(): boolean {
  return siteBackupRunning;
}

function toSiteBackupGql(doc: SiteBackupDoc) {
  return {
    id: String(doc._id),
    siteId: String(doc.siteId),
    tier: doc.tier,
    trigger: doc.trigger,
    status: doc.status,
    label: doc.label ?? null,
    createdByUserId: doc.createdByUserId ? String(doc.createdByUserId) : null,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    sizeBytes: doc.sizeBytes,
    errorMessage: doc.errorMessage ?? null,
    bundleVersion: doc.bundleVersion,
    summary: doc.summary,
  };
}

export async function listSiteBackups(siteId: string, limit = 50, offset = 0) {
  const rows = await SiteBackupModel.find({ siteId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(Math.min(limit, 100))
    .lean();
  return rows.map((r) => toSiteBackupGql(r as SiteBackupDoc));
}

export async function pruneSiteBackups(siteId: string, tier: BackupTier): Promise<void> {
  const keep = retentionLimitForTier(tier);
  if (keep <= 0) return;
  const rows = await SiteBackupModel.find({ siteId, tier, status: 'completed' })
    .sort({ createdAt: -1 })
    .skip(keep)
    .lean();
  for (const row of rows) {
    await deleteSiteBackup(String(row._id), siteId);
  }
}

export async function pruneManualSiteBackups(siteId: string): Promise<void> {
  const manualKeep = retentionLimitForTier('manual');
  const manualRows = await SiteBackupModel.find({ siteId, tier: 'manual', status: 'completed' })
    .sort({ createdAt: -1 })
    .skip(manualKeep)
    .lean();
  for (const row of manualRows) {
    await deleteSiteBackup(String(row._id), siteId);
  }
}

export async function createSiteBackup(
  siteId: string,
  opts: { tier: BackupTier; trigger: BackupTrigger; userId?: string; label?: string },
): Promise<ReturnType<typeof toSiteBackupGql>> {
  const site = await SiteModel.findById(siteId).lean();
  if (!site) throw new Error('Site not found');

  if (siteBackupRunning) {
    throw new Error('Another site backup is already running');
  }

  const running = await SiteBackupModel.findOne({ siteId, status: 'running' }).lean();
  if (running) throw new Error('A backup for this site is already running');

  const backupId = new mongoose.Types.ObjectId();
  const storageKey = siteBackupStorageKey(siteId, String(backupId));

  const doc = await SiteBackupModel.create({
    _id: backupId,
    siteId,
    tier: opts.tier,
    trigger: opts.trigger,
    status: 'running',
    label: opts.label?.trim() || undefined,
    createdByUserId: opts.userId ? new mongoose.Types.ObjectId(opts.userId) : undefined,
    storageKey,
    bundleVersion: 2,
    summary: { contentTypes: 0, entries: 0, assets: 0, siteSettings: false },
  });

  siteBackupRunning = true;
  try {
    const { bundle, summary } = await exportSiteBackupBundle(siteId);
    const json = JSON.stringify(bundle);
    const sizeBytes = await writeBackupBlob(storageKey, json);
    const updated = await SiteBackupModel.findOneAndUpdate(
      { _id: backupId },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          sizeBytes,
          summary,
        },
      },
      { returnDocument: 'after' },
    ).lean();
    await pruneSiteBackups(siteId, opts.tier);
    if (opts.tier === 'manual') await pruneManualSiteBackups(siteId);
    return toSiteBackupGql(updated as SiteBackupDoc);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backup failed';
    await SiteBackupModel.updateOne({ _id: backupId }, { $set: { status: 'failed', errorMessage: message } });
    throw err;
  } finally {
    siteBackupRunning = false;
  }
}

export async function deleteSiteBackup(backupId: string, siteId: string): Promise<boolean> {
  const doc = await SiteBackupModel.findOne({ _id: backupId, siteId }).lean();
  if (!doc) return false;
  await deleteBackupBlob(doc.storageKey);
  await SiteBackupModel.deleteOne({ _id: backupId, siteId });
  return true;
}

export async function restoreSiteBackup(
  siteId: string,
  backupId: string,
  userId: string,
): Promise<{ preRestoreBackupId: string; summary: Awaited<ReturnType<typeof replaceSiteFromBundle>> }> {
  const doc = await SiteBackupModel.findOne({ _id: backupId, siteId, status: 'completed' }).lean();
  if (!doc) throw new Error('Backup not found or not completed');

  const pre = await createSiteBackup(siteId, {
    tier: 'manual',
    trigger: 'manual',
    userId,
    label: 'Pre-restore snapshot',
  });

  const bundle = await readBackupJson<unknown>(doc.storageKey);
  const summary = await replaceSiteFromBundle(siteId, userId, bundle);
  await bumpSiteContentRevision(siteId);
  return { preRestoreBackupId: pre.id, summary };
}

export async function getSiteBackupBundle(siteId: string, backupId: string): Promise<unknown> {
  const doc = await SiteBackupModel.findOne({ _id: backupId, siteId, status: 'completed' }).lean();
  if (!doc) throw new Error('Backup not found');
  return readBackupJson(doc.storageKey);
}

export async function isSiteBackupEnabled(siteId: string): Promise<boolean> {
  const doc = await SiteSettingsModel.findOne({ siteId }).select({ backupEnabled: 1 }).lean();
  return doc?.backupEnabled !== false;
}

export async function setSiteBackupEnabled(siteId: string, enabled: boolean): Promise<boolean> {
  await SiteSettingsModel.findOneAndUpdate({ siteId }, { $set: { backupEnabled: enabled } }, { upsert: true });
  return enabled;
}

export async function runScheduledSiteBackups(tier: BackupTier): Promise<void> {
  const sites = await SiteModel.find({}).select({ _id: 1 }).lean();
  for (const site of sites) {
    const sid = String(site._id);
    if (!(await isSiteBackupEnabled(sid))) continue;
    try {
      await createSiteBackup(sid, { tier, trigger: 'scheduled' });
    } catch (err) {
      console.error(`[backup] site ${sid} tier ${tier} failed:`, err);
    }
  }
}

/** Used by tests / diagnostics */
export async function resolveSiteBackupExportOptions(siteId: string) {
  return resolveFullSiteBundleExportOptions(siteId);
}
