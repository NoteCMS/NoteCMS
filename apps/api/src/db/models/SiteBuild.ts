import { Schema, model } from 'mongoose';

/** URL-safe identifier unique per site, e.g. `production`, `staging`. */
export const SITE_BUILD_SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export type SiteBuildTriggerRole = 'editor' | 'owner';

const siteBuildSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site', index: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },

    /** Minimum site role required to trigger this build. Owners always can. */
    triggerMinRole: { type: String, enum: ['editor', 'owner'], default: 'editor' },

    publishGithubOwner: { type: String, trim: true },
    publishGithubRepo: { type: String, trim: true },
    publishEventType: { type: String, trim: true },
    publishGithubPatEnc: { type: String },

    /** SHA-256 hex digest of bearer token for build completion callback. */
    publishReturnTokenHash: { type: String },

    publishLastTriggerAt: { type: Date },
    publishLastTriggerOk: { type: Boolean },
    publishLastTriggerStatusCode: { type: Number },
    publishLastTriggerMessage: { type: String, trim: true },

    publishLastReturnAt: { type: Date },
    publishLastReturnStatus: { type: String, trim: true },
    publishLastReturnRunUrl: { type: String, trim: true },
    publishLastReturnPayload: { type: Schema.Types.Mixed },

    lastPublishedWatermark: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

siteBuildSchema.index({ siteId: 1, slug: 1 }, { unique: true });
siteBuildSchema.index({ siteId: 1, sortOrder: 1 });

export type SiteBuildDoc = {
  _id: unknown;
  siteId: unknown;
  slug: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  triggerMinRole: SiteBuildTriggerRole;
  publishGithubOwner?: string | null;
  publishGithubRepo?: string | null;
  publishEventType?: string | null;
  publishGithubPatEnc?: string | null;
  publishReturnTokenHash?: string | null;
  publishLastTriggerAt?: Date | null;
  publishLastTriggerOk?: boolean | null;
  publishLastTriggerStatusCode?: number | null;
  publishLastTriggerMessage?: string | null;
  publishLastReturnAt?: Date | null;
  publishLastReturnStatus?: string | null;
  publishLastReturnRunUrl?: string | null;
  publishLastReturnPayload?: unknown;
  lastPublishedWatermark?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export const SiteBuildModel = model('SiteBuild', siteBuildSchema);
