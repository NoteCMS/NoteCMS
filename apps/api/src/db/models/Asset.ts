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
    /** Normalized 0–1; used for object-position / cropping on consuming sites */
    focalX: { type: Number, default: 0.5 },
    focalY: { type: Number, default: 0.5 },
    storageKeyOriginal: { type: String, required: true },
    /** ~1600px derivative; exposed as `variants.web` for backward compatibility */
    storageKeyWeb: { type: String, required: true },
    storageKeyThumb: { type: String, required: true },
    storageKeySmall: { type: String, default: null },
    storageKeyMedium: { type: String, default: null },
    storageKeyXlarge: { type: String, default: null },
  },
  { timestamps: true },
);

assetSchema.index({ siteId: 1, createdAt: -1 });

export const AssetModel = model('Asset', assetSchema);
