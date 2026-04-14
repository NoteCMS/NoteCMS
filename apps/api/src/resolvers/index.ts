import { GraphQLJSON } from 'graphql-scalars';
import { comparePassword, hashPassword, signToken } from '../auth/security.js';
import { requireRole } from '../auth/rbac.js';
import { ContentTypeModel } from '../db/models/ContentType.js';
import { EntryModel } from '../db/models/Entry.js';
import { MembershipModel, roles } from '../db/models/Membership.js';
import { SiteModel } from '../db/models/Site.js';
import { UserModel } from '../db/models/User.js';
import { validateEntryData, validateFieldDefinitions } from '../domain/fields/validator.js';

type Ctx = { userId?: string };

function toId(doc: any) {
  return { ...doc, id: String(doc._id), _id: undefined };
}

async function toGlobalUser(userId: string) {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new Error('User not found');
  const memberships = await MembershipModel.find({ userId: user._id }).lean();
  const siteIds = memberships.map((membership) => membership.siteId);
  const sites = await SiteModel.find({ _id: { $in: siteIds } }).lean();
  const access = memberships
    .map((membership) => {
      const site = sites.find((candidate) => String(candidate._id) === String(membership.siteId));
      if (!site) return null;
      return {
        siteId: String(site._id),
        siteName: site.name,
        role: membership.role,
      };
    })
    .filter(Boolean);

  return {
    id: String(user._id),
    email: user.email,
    status: user.status,
    isAdmin: user.isAdmin ?? false,
    access,
  };
}

export const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    me: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.userId) return null;
      const user = await UserModel.findById(ctx.userId).lean();
      return user ? toId(user) : null;
    },
    listMySites: async (_: unknown, __: unknown, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const memberships = await MembershipModel.find({ userId: ctx.userId }).lean();
      const siteIds = memberships.map((m) => m.siteId);
      const sites = await SiteModel.find({ _id: { $in: siteIds } }).lean();
      return sites.map((site) => {
        const membership = memberships.find((m) => String(m.siteId) === String(site._id));
        return { ...toId(site), url: (site as any).url ?? (site as any).slug ?? '', role: membership?.role };
      });
    },
    globalUsers: async (
      _: unknown,
      { role, siteId, status, isAdmin }: { role?: string; siteId?: string; status?: string; isAdmin?: boolean },
      ctx: Ctx,
    ) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const adminMemberships = await MembershipModel.find({ userId: ctx.userId, role: { $in: ['owner', 'admin'] } }).lean();
      const allowedSiteIds = adminMemberships.map((membership) => String(membership.siteId));
      if (!allowedSiteIds.length) return [];

      const membershipFilter: Record<string, unknown> = { siteId: { $in: allowedSiteIds } };
      if (role) membershipFilter.role = role;
      if (siteId) membershipFilter.siteId = siteId;

      const memberships = await MembershipModel.find(membershipFilter).lean();
      const uniqueUserIds = [...new Set(memberships.map((membership) => String(membership.userId)))];
      const userFilter: Record<string, unknown> = { _id: { $in: uniqueUserIds } };
      if (status) userFilter.status = status;
      if (isAdmin !== undefined) userFilter.isAdmin = isAdmin;

      const users = await UserModel.find(userFilter).lean();
      const userIdSet = new Set(users.map((user) => String(user._id)));
      const filteredMemberships = memberships.filter((membership) => userIdSet.has(String(membership.userId)));
      const visibleSiteIds = [...new Set(filteredMemberships.map((membership) => String(membership.siteId)))];
      const sites = await SiteModel.find({ _id: { $in: visibleSiteIds } }).lean();

      return users.map((user) => {
        const access = filteredMemberships
          .filter((membership) => String(membership.userId) === String(user._id))
          .map((membership) => {
            const site = sites.find((candidate) => String(candidate._id) === String(membership.siteId));
            return {
              siteId: String(membership.siteId),
              siteName: site?.name ?? 'Unknown site',
              role: membership.role,
            };
          });
        return {
          id: String(user._id),
          email: user.email,
          status: user.status,
          isAdmin: user.isAdmin ?? false,
          access,
        };
      });
    },
    contentTypes: async (_: unknown, { siteId }: { siteId: string }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'viewer');
      return (await ContentTypeModel.find({ siteId }).lean()).map(toId);
    },
    entries: async (_: unknown, { siteId, contentTypeId, limit = 30, offset = 0 }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'viewer');
      const entries = await EntryModel.find({ siteId, contentTypeId }).skip(offset).limit(limit).lean();
      return entries.map(toId);
    },
  },
  Mutation: {
    register: async (_: unknown, { email, password }: { email: string; password: string }) => {
      const existing = await UserModel.findOne({ email: email.toLowerCase() });
      if (existing) throw new Error('Email already in use');
      const user = await UserModel.create({ email: email.toLowerCase(), passwordHash: await hashPassword(password) });
      return { token: signToken({ userId: String(user._id) }), user: toId(user.toObject()) };
    },
    login: async (_: unknown, { email, password, siteId }: any) => {
      const user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) throw new Error('Invalid credentials');
      if (!(await comparePassword(password, user.passwordHash))) throw new Error('Invalid credentials');
      return { token: signToken({ userId: String(user._id), siteId }), user: toId(user.toObject()) };
    },
    createSite: async (_: unknown, { name, url }: { name: string; url: string }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const creator = await UserModel.findById(ctx.userId).lean();
      if (!creator?.isAdmin) throw new Error('Only admins can create new sites');
      const site = await SiteModel.create({ name, url, ownerId: ctx.userId });
      await MembershipModel.create({ userId: ctx.userId, siteId: site._id, role: 'owner' });
      return toId(site.toObject());
    },
    createGlobalUser: async (_: unknown, { email, password, status = 'active', isAdmin = false }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const normalizedEmail = email.toLowerCase();
      const existing = await UserModel.findOne({ email: normalizedEmail });
      if (existing) throw new Error('Email already in use');
      if (!['active', 'disabled'].includes(status)) throw new Error('Invalid status');

      const user = await UserModel.create({
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        status,
        isAdmin,
      });

      return toGlobalUser(String(user._id));
    },
    updateUserStatus: async (_: unknown, { userId, status }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      if (!['active', 'disabled'].includes(status)) throw new Error('Invalid status');
      const hasAdminMembership = await MembershipModel.findOne({
        userId: ctx.userId,
        role: { $in: ['owner', 'admin'] },
      }).lean();
      if (!hasAdminMembership) throw new Error('Access denied: admin role required');

      const user = await UserModel.findByIdAndUpdate(userId, { status }, { new: true });
      if (!user) throw new Error('User not found');

      return toGlobalUser(String(user._id));
    },
    setUserAdmin: async (_: unknown, { userId, isAdmin }: { userId: string; isAdmin: boolean }, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const currentUser = await UserModel.findById(ctx.userId).lean();
      if (!currentUser?.isAdmin) throw new Error('Only admins can change admin access');
      const user = await UserModel.findByIdAndUpdate(userId, { isAdmin }, { new: true });
      if (!user) throw new Error('User not found');
      return toGlobalUser(String(user._id));
    },
    setUserSiteRole: async (_: unknown, { userId, siteId, role }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      if (!roles.includes(role)) throw new Error('Invalid role');

      const user = await UserModel.findById(userId).lean();
      if (!user) throw new Error('User not found');

      await MembershipModel.findOneAndUpdate(
        { userId, siteId },
        { role },
        { upsert: true, new: true },
      );

      return toGlobalUser(String(userId));
    },
    removeUserSiteAccess: async (_: unknown, { userId, siteId }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      await MembershipModel.deleteOne({ userId, siteId });
      return toGlobalUser(String(userId));
    },
    inviteUser: async (_: unknown, { siteId, email, role }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      if (!roles.includes(role)) throw new Error('Invalid role');
      const user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) throw new Error('User not found');
      const membership = await MembershipModel.findOneAndUpdate(
        { userId: user._id, siteId },
        { role },
        { upsert: true, new: true },
      );
      return toId(membership!.toObject());
    },
    setRole: async (_: unknown, { siteId, userId, role }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      if (!roles.includes(role)) throw new Error('Invalid role');
      const membership = await MembershipModel.findOneAndUpdate({ userId, siteId }, { role }, { new: true });
      if (!membership) throw new Error('Membership not found');
      return toId(membership.toObject());
    },
    createContentType: async (_: unknown, { siteId, name, slug, fields }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      const safeFields = validateFieldDefinitions(fields);
      const ct = await ContentTypeModel.create({ siteId, name, slug, fields: safeFields });
      return toId(ct.toObject());
    },
    updateContentType: async (_: unknown, { id, siteId, ...rest }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      if (rest.fields) rest.fields = validateFieldDefinitions(rest.fields);
      const ct = await ContentTypeModel.findOneAndUpdate({ _id: id, siteId }, rest, { new: true });
      if (!ct) throw new Error('Content type not found');
      return toId(ct.toObject());
    },
    deleteContentType: async (_: unknown, { id, siteId }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      await ContentTypeModel.deleteOne({ _id: id, siteId });
      return true;
    },
    createEntry: async (_: unknown, { siteId, contentTypeId, slug, data }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      const contentType = await ContentTypeModel.findOne({ _id: contentTypeId, siteId }).lean();
      if (!contentType) throw new Error('Content type not found');
      validateEntryData(contentType.fields as any, data as Record<string, unknown>);
      const entry = await EntryModel.create({ siteId, contentTypeId, slug, data });
      return toId(entry.toObject());
    },
    updateEntry: async (_: unknown, { id, siteId, ...rest }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      const current = await EntryModel.findOne({ _id: id, siteId }).lean();
      if (!current) throw new Error('Entry not found');
      if (rest.data) {
        const ct = await ContentTypeModel.findOne({ _id: current.contentTypeId, siteId }).lean();
        if (!ct) throw new Error('Content type not found');
        validateEntryData(ct.fields as any, rest.data as Record<string, unknown>);
      }
      const entry = await EntryModel.findOneAndUpdate({ _id: id, siteId }, rest, { new: true });
      if (!entry) throw new Error('Entry not found');
      return toId(entry.toObject());
    },
    deleteEntry: async (_: unknown, { id, siteId }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      await EntryModel.deleteOne({ _id: id, siteId });
      return true;
    },
  },
};
