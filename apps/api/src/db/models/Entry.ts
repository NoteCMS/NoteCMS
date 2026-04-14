import { Schema, model } from 'mongoose';

const entrySchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site' },
    contentTypeId: { type: Schema.Types.ObjectId, required: true, ref: 'ContentType' },
    slug: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

entrySchema.index(
  { siteId: 1, contentTypeId: 1, slug: 1 },
  {
    unique: true,
    partialFilterExpression: { slug: { $type: 'string' } },
  },
);

export const EntryModel = model('Entry', entrySchema);
