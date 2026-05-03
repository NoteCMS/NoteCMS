import { Schema, model } from 'mongoose';

/** `menuEntries` keys: slug-like identifiers (e.g. `header`, `footer_nav`). */
export const MENU_SLOT_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
export const MENU_SLOT_MAX_SLOTS = 50;

const siteSettingsSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, unique: true, ref: 'Site' },
    logoAssetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
    faviconAssetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
    siteTitle: { type: String, trim: true },
    menuEntries: {
      type: Map,
      of: String,
      default: () => new Map(),
    },
    /** When false, `/api/mcp` rejects requests scoped to this site (API key or JWT with siteId). Default true. */
    mcpEnabled: { type: Boolean, default: true },

    /** Outbound GitHub `repository_dispatch` (PAT encrypted at rest). */
    publishEnabled: { type: Boolean, default: false },
    publishGithubOwner: { type: String, trim: true },
    publishGithubRepo: { type: String, trim: true },
    publishEventType: { type: String, trim: true },
    publishGithubPatEnc: { type: String },

    /** SHA-256 hex digest of bearer token for `POST /hooks/site-build/:siteId`. */
    publishReturnTokenHash: { type: String },

    publishLastTriggerAt: { type: Date },
    publishLastTriggerOk: { type: Boolean },
    publishLastTriggerStatusCode: { type: Number },
    publishLastTriggerMessage: { type: String, trim: true },

    publishLastReturnAt: { type: Date },
    publishLastReturnStatus: { type: String, trim: true },
    publishLastReturnRunUrl: { type: String, trim: true },
    publishLastReturnPayload: { type: Schema.Types.Mixed },

    /** Monotonic counter bumped when site content, types, settings, or assets change (preview + publish alignment). */
    contentRevision: { type: Number, default: 0 },
    /** Written when CI reports `success`; optional fields from workflow `detail` (contentRevision, bundleHash, builtAt, workflowRunId). */
    lastPublishedWatermark: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const SiteSettingsModel = model('SiteSettings', siteSettingsSchema);
