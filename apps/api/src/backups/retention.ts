import { env } from '../config/env.js';
import type { BackupTier } from './types.js';

export function retentionLimitForTier(tier: BackupTier): number {
  switch (tier) {
    case 'hourly':
      return env.backupRetentionHourly;
    case 'daily':
      return env.backupRetentionDaily;
    case 'weekly':
      return env.backupRetentionWeekly;
    case 'manual':
      return env.backupRetentionManual;
    default:
      return 0;
  }
}
