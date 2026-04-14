import { Schema, model } from 'mongoose';

const entrySchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site' },
    contentTypeId: { type: Schema.Types.ObjectId, required: true, ref: 'ContentType' },
    slug: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

entrySchema.index({ siteId: 1, contentTypeId: 1, slug: 1 }, { unique: true });

export const EntryModel = model('Entry', entrySchema);
