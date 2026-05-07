import { Schema, model } from 'mongoose';

/** Append-only history for an entry (publish, draft save, rollback, migration). */
const entryRevisionSchema = new Schema(
  {
    entryId: { type: Schema.Types.ObjectId, required: true, ref: 'Entry', index: true },
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site', index: true },
    revisionNumber: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    kind: {
      type: String,
      required: true,
      enum: ['migrate_initial', 'draft_save', 'publish', 'rollback', 'unpublish', 'restore'],
    },
    payload: {
      type: {
        name: { type: String, required: true },
        slug: { type: String, default: null },
        data: { type: Schema.Types.Mixed, default: {} },
      },
      required: true,
    },
    previousRevisionId: { type: Schema.Types.ObjectId, ref: 'EntryRevision', default: null },
  },
  { timestamps: true },
);

entryRevisionSchema.index({ entryId: 1, revisionNumber: -1 });
entryRevisionSchema.index({ siteId: 1, createdAt: -1 });

export const EntryRevisionModel = model('EntryRevision', entryRevisionSchema);
