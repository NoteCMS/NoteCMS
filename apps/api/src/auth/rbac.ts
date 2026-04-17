import { MembershipModel, type Role } from '../db/models/Membership.js';

export type RequestContext = {
  userId?: string;
  apiKey?: { id: string; siteId: string };
};

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

/** Public / headless read access: JWT (viewer+) or API key scoped to the same site. */
export async function requireReadSite(ctx: RequestContext, siteId: string) {
  if (ctx.apiKey) {
    if (String(ctx.apiKey.siteId) !== String(siteId)) throw new Error('Access denied');
    return;
  }
  if (!ctx.userId) throw new Error('Unauthorized');
  await requireRole(ctx.userId, siteId, 'viewer');
}
