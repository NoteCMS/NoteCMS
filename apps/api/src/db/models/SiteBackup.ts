import { Schema, model } from 'mongoose';
import type { BackupStatus, BackupTier, BackupTrigger } from '../../backups/types.js';

const summarySchema = new Schema(
  {
    contentTypes: { type: Number, default: 0 },
    entries: { type: Number, default: 0 },
    assets: { type: Number, default: 0 },
    siteSettings: { type: Boolean, default: false },
  },
  { _id: false },
);

const siteBackupSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site', index: true },
    tier: { type: String, enum: ['hourly', 'daily', 'weekly', 'manual'], required: true, index: true },
    trigger: { type: String, enum: ['scheduled', 'manual'], required: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], required: true, index: true },
    label: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },
    sizeBytes: { type: Number, default: 0 },
    storageKey: { type: String, required: true },
    errorMessage: { type: String },
    bundleVersion: { type: Number, default: 2 },
    summary: { type: summarySchema, default: () => ({}) },
  },
  { timestamps: true },
);

siteBackupSchema.index({ siteId: 1, tier: 1, createdAt: -1 });

export type SiteBackupDoc = {
  _id: unknown;
  siteId: unknown;
  tier: BackupTier;
  trigger: BackupTrigger;
  status: BackupStatus;
  label?: string;
  createdByUserId?: unknown;
  completedAt?: Date;
  sizeBytes: number;
  storageKey: string;
  errorMessage?: string;
  bundleVersion: number;
  summary: { contentTypes: number; entries: number; assets: number; siteSettings: boolean };
  createdAt: Date;
  updatedAt: Date;
};

export const SiteBackupModel = model('SiteBackup', siteBackupSchema);
