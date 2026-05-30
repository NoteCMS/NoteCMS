import cron from 'node-cron';
import { env } from '../config/env.js';
import { isMongoDbToolsAvailable } from './mongodb-tools.js';
import { runScheduledPlatformBackup } from './platform-backup-service.js';
import type { BackupTier } from './types.js';
import { runScheduledSiteBackups } from '../site/site-backup-service.js';

const tierJobs: Array<{ tier: BackupTier; expression: string }> = [
  { tier: 'hourly', expression: env.backupCronHourly },
  { tier: 'daily', expression: env.backupCronDaily },
  { tier: 'weekly', expression: env.backupCronWeekly },
];

let started = false;

async function runTier(tier: BackupTier): Promise<void> {
  console.info(`[backup] starting scheduled ${tier} backups`);
  await runScheduledSiteBackups(tier);
  await runScheduledPlatformBackup(tier);
  console.info(`[backup] finished scheduled ${tier} backups`);
}

export function startBackupScheduler(): void {
  if (started || !env.backupSchedulerEnabled) return;
  started = true;

  void isMongoDbToolsAvailable().then((toolsOk) => {
    if (env.platformBackupEnabled && !toolsOk) {
      console.warn(
        '[backup] platform backups enabled but mongodump/mongorestore not found — scheduled platform jobs will be skipped',
      );
    } else if (env.platformBackupEnabled) {
      console.info('[backup] platform backups enabled (mongodump available)');
    }
  });

  for (const { tier, expression } of tierJobs) {
    if (!expression.trim()) continue;
    if (!cron.validate(expression)) {
      console.warn(`[backup] invalid cron for ${tier}: ${expression}`);
      continue;
    }
    cron.schedule(expression, () => {
      void runTier(tier).catch((err) => console.error(`[backup] ${tier} scheduler error`, err));
    });
    console.info(`[backup] scheduled ${tier} backups: ${expression}`);
  }
}
