import { Schema, model } from 'mongoose';

export const roles = ['owner', 'admin', 'editor', 'viewer'] as const;
export type Role = (typeof roles)[number];

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    siteId: { type: Schema.Types.ObjectId, required: true, ref: 'Site' },
    role: { type: String, enum: roles, required: true },
  },
  { timestamps: true },
);

membershipSchema.index({ userId: 1, siteId: 1 }, { unique: true });

export const MembershipModel = model('Membership', membershipSchema);
