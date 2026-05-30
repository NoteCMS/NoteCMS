import { Schema, model } from 'mongoose';

/** Singleton-style platform flags (e.g. maintenance during restore). */
const platformStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceReason: { type: String },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const PlatformStateModel = model('PlatformState', platformStateSchema);

const PLATFORM_KEY = 'default';

export async function getPlatformMaintenanceMode(): Promise<boolean> {
  const doc = await PlatformStateModel.findOne({ key: PLATFORM_KEY }).lean();
  return Boolean(doc?.maintenanceMode);
}

export async function setPlatformMaintenanceMode(enabled: boolean, reason?: string): Promise<void> {
  await PlatformStateModel.findOneAndUpdate(
    { key: PLATFORM_KEY },
    { $set: { maintenanceMode: enabled, maintenanceReason: reason ?? null, updatedAt: new Date() } },
    { upsert: true },
  );
}
