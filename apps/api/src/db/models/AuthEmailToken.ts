import { Schema, model } from 'mongoose';

export const emailTokenPurposes = ['password_reset', 'account_invite'] as const;
export type EmailTokenPurpose = (typeof emailTokenPurposes)[number];

const authEmailTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    tokenHash: { type: String, required: true, index: true },
    purpose: { type: String, enum: emailTokenPurposes, required: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

authEmailTokenSchema.index({ userId: 1, purpose: 1, usedAt: 1 });

export const AuthEmailTokenModel = model('AuthEmailToken', authEmailTokenSchema);
