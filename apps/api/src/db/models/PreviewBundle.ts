import { Schema, model } from 'mongoose';

const previewBundleSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site', index: true },
    /** Public path segment (UUID) — unguessable; Bearer secret required to fetch. */
    publicId: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    createdByUserId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    label: { type: String, trim: true },
    sourceContentRevision: { type: Number },
    sha256: { type: String, required: true },
    byteLength: { type: Number, required: true },
    gridFsFileId: { type: Schema.Types.ObjectId, default: null },
    /** Inline JSON string when payload is small enough for BSON. */
    payloadJson: { type: String, default: null },
  },
  { timestamps: true },
);

previewBundleSchema.index({ siteId: 1, revokedAt: 1, expiresAt: -1 });

export const PreviewBundleModel = model('PreviewBundle', previewBundleSchema);
