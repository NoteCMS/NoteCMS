import { Schema, model } from 'mongoose';

const apiKeySchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site' },
    name: { type: String, required: true },
    secretHash: { type: String, required: true },
    keyHint: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

apiKeySchema.index({ siteId: 1, revokedAt: 1 });

export const ApiKeyModel = model('ApiKey', apiKeySchema);
