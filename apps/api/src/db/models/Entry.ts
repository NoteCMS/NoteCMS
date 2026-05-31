import { Schema, model } from 'mongoose';

const entrySchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site' },
    contentTypeId: { type: Schema.Types.ObjectId, required: true, ref: 'ContentType' },
    /** Display label (working copy); unique per content type within a site among non-deleted rows. */
    name: { type: String, trim: true, required: true },
    slug: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
    /** SEO working copy (draft). */
    meta: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
    },
    /** SEO published snapshot. */
    publishedMeta: {
      title: { type: String, default: null },
      description: { type: String, default: null },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    lifecycleStatus: {
      type: String,
      enum: ['draft', 'published'],
      default: 'published',
    },
    publishedAt: { type: Date, default: null },
    /** When set and in the future, draft is hidden from published consumer lists until due. */
    scheduledPublishAt: { type: Date, default: null },
    scheduledUnpublishAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /** Last published snapshot (consumer default for API keys). */
    publishedName: { type: String, default: null },
    publishedSlug: { type: String, default: null },
    publishedData: { type: Schema.Types.Mixed, default: null },
    /** True when `lifecycleStatus` is published and working fields differ from published snapshot. */
    hasUnpublishedChanges: { type: Boolean, default: false },

    lastPublishedRevisionId: { type: Schema.Types.ObjectId, ref: 'EntryRevision', default: null },
  },
  { timestamps: true },
);

/** Slug uniqueness among published, non-deleted entries with a slug string. */
entrySchema.index(
  { siteId: 1, contentTypeId: 1, publishedSlug: 1 },
  {
    unique: true,
    partialFilterExpression: {
      publishedSlug: { $type: 'string' },
      lifecycleStatus: 'published',
      deletedAt: null,
    },
  },
);

entrySchema.index(
  { siteId: 1, contentTypeId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  },
);

entrySchema.index({ siteId: 1, contentTypeId: 1, lifecycleStatus: 1, deletedAt: 1, updatedAt: -1 });

export const EntryModel = model('Entry', entrySchema);
