import { Schema, model, type InferSchemaType } from 'mongoose';

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
  },
  { timestamps: true },
);

export type SiteSettingsDoc = InferSchemaType<typeof siteSettingsSchema> & { _id: string };
export const SiteSettingsModel = model('SiteSettings', siteSettingsSchema);
