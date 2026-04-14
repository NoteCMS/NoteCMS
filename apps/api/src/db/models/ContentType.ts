import { Schema, model } from 'mongoose';

const fieldSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    required: { type: Boolean, default: false },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const contentTypeSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site' },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    fields: { type: [fieldSchema], default: [] },
  },
  { timestamps: true },
);

contentTypeSchema.index({ siteId: 1, slug: 1 }, { unique: true });

export const ContentTypeModel = model('ContentType', contentTypeSchema);
