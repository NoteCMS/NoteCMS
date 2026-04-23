import { MembershipModel } from './models/Membership.js';

/** One-time: former site `admin` role maps to `editor` (content + settings that editors had). */
export async function migrateMembershipRoles(): Promise<void> {
  const result = await MembershipModel.updateMany({ role: 'admin' }, { $set: { role: 'editor' } });
  if (result.modifiedCount > 0) {
    console.info(`[migrate] Updated ${String(result.modifiedCount)} membership(s) from admin → editor`);
  }
}
