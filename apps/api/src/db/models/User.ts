import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Shown in the app sidebar and account settings; optional. */
    displayName: { type: String, trim: true, maxlength: 80 },
    /** Absent until the user completes initial password setup (bootstrap admin). */
    passwordHash: { type: String, required: false },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    isAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: string };
export const UserModel = model('User', userSchema);
