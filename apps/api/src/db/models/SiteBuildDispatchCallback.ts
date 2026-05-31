import { Schema, model } from 'mongoose';

/** One-time completion token issued when a build is triggered. */
const siteBuildDispatchCallbackSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site', index: true },
    /** Null for legacy site-level triggers without a SiteBuild row. */
    buildId: { type: Schema.Types.ObjectId, ref: 'SiteBuild', default: null, index: true },
    tokenHash: { type: String, required: true, unique: true },
    usedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

siteBuildDispatchCallbackSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SiteBuildDispatchCallbackDoc = {
  _id: unknown;
  siteId: unknown;
  buildId: unknown | null;
  tokenHash: string;
  usedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const SiteBuildDispatchCallbackModel = model('SiteBuildDispatchCallback', siteBuildDispatchCallbackSchema);
