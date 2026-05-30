import { Schema, model } from 'mongoose';
import type { BackupStatus, BackupTier, BackupTrigger } from '../../backups/types.js';

const platformBackupSchema = new Schema(
  {
    tier: { type: String, enum: ['hourly', 'daily', 'weekly', 'manual'], required: true, index: true },
    trigger: { type: String, enum: ['scheduled', 'manual'], required: true },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], required: true, index: true },
    label: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },
    sizeBytes: { type: Number, default: 0 },
    mongoArchiveKey: { type: String, required: true },
    assetsArchiveKey: { type: String },
    errorMessage: { type: String },
    mongoVersion: { type: String },
  },
  { timestamps: true },
);

platformBackupSchema.index({ tier: 1, createdAt: -1 });

export type PlatformBackupDoc = {
  _id: unknown;
  tier: BackupTier;
  trigger: BackupTrigger;
  status: BackupStatus;
  label?: string;
  createdByUserId?: unknown;
  completedAt?: Date;
  sizeBytes: number;
  mongoArchiveKey: string;
  assetsArchiveKey?: string;
  errorMessage?: string;
  mongoVersion?: string;
  createdAt: Date;
  updatedAt: Date;
};

export const PlatformBackupModel = model('PlatformBackup', platformBackupSchema);
