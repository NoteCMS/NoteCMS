import { Schema, model, type InferSchemaType } from 'mongoose';

const siteSchema = new Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true, unique: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
  },
  { timestamps: true },
);

export type SiteDoc = InferSchemaType<typeof siteSchema> & { _id: string };
export const SiteModel = model('Site', siteSchema);
