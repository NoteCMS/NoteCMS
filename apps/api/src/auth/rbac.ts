import { MembershipModel, type Role } from '../db/models/Membership.js';
import { UserModel } from '../db/models/User.js';
import { apiKeyHasScope, type ApiKeyScope } from './api-key-scopes.js';
import type { RequestContext } from './types.js';

export type { RequestContext, ApiKeyPrincipal } from './types.js';

const rank: Record<Role, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

/** Platform admins (`User.isAdmin`) bypass site role checks and are treated as owner on any site. */
export async function requireRole(userId: string, siteId: string, minRole: Role) {
  const user = await UserModel.findById(userId).select({ isAdmin: 1 }).lean();
  if (user?.isAdmin) {
    return { userId, siteId, role: 'owner' as Role };
  }
  const membership = await MembershipModel.findOne({ userId, siteId }).lean();
  if (!membership) throw new Error('Access denied: no membership for this site');
  if (rank[membership.role as Role] < rank[minRole]) throw new Error('Access denied: insufficient role');
  return membership;
}

/**
 * Site access for reads. JWT: viewer+ on site. API key: same site + optional scope check.
 */
export async function requireReadSite(ctx: RequestContext, siteId: string, apiKeyReadScope?: ApiKeyScope) {
  if (ctx.apiKey) {
    if (String(ctx.apiKey.siteId) !== String(siteId)) throw new Error('Access denied');
    if (apiKeyReadScope && !apiKeyHasScope(ctx.apiKey.scopes, apiKeyReadScope)) {
      throw new Error('Access denied: insufficient API key scope');
    }
    return;
  }
  if (!ctx.userId) throw new Error('Unauthorized');
  const user = await UserModel.findById(ctx.userId).select({ isAdmin: 1 }).lean();
  if (user?.isAdmin) return;
  await requireRole(ctx.userId, siteId, 'viewer');
}
