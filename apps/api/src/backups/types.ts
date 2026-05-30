export type BackupTier = 'hourly' | 'daily' | 'weekly' | 'manual';
export type BackupTrigger = 'scheduled' | 'manual';
export type BackupStatus = 'pending' | 'running' | 'completed' | 'failed';

export type BackupSummary = {
  contentTypes: number;
  entries: number;
  assets: number;
  siteSettings: boolean;
};
