import { Schema, model } from 'mongoose';

const assetSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site', index: true },
    uploadedBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    alt: { type: String, default: '' },
    title: { type: String, default: '' },
    storageKeyOriginal: { type: String, required: true },
    storageKeyWeb: { type: String, required: true },
    storageKeyThumb: { type: String, required: true },
  },
  { timestamps: true },
);

assetSchema.index({ siteId: 1, createdAt: -1 });

export const AssetModel = model('Asset', assetSchema);
