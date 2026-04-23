import { Schema, model } from 'mongoose';

/** Site-scoped only. Platform-wide power is `User.isAdmin` (platform admin). */
export const roles = ['owner', 'editor', 'viewer'] as const;
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
