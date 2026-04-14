import { MembershipModel, type Role } from '../db/models/Membership.js';

const rank: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

export async function requireRole(userId: string, siteId: string, minRole: Role) {
  const membership = await MembershipModel.findOne({ userId, siteId }).lean();
  if (!membership) throw new Error('Access denied: no membership for this site');
  if (rank[membership.role as Role] < rank[minRole]) throw new Error('Access denied: insufficient role');
  return membership;
}
