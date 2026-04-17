import { GraphQLJSON } from 'graphql-scalars';
import { comparePassword, hashPassword, signToken } from '../auth/security.js';
import { requireRole } from '../auth/rbac.js';
import { env } from '../config/env.js';
import { getStorageAdapter } from '../assets/index.js';
import { buildImageVariants, sanitizeFilename } from '../assets/image.js';
import { normalizeStorageKey } from '../assets/storage.js';
import { ContentTypeModel } from '../db/models/ContentType.js';
import { EntryModel } from '../db/models/Entry.js';
import { AssetModel } from '../db/models/Asset.js';
import { MembershipModel, roles } from '../db/models/Membership.js';
import { SiteModel } from '../db/models/Site.js';
import { UserModel } from '../db/models/User.js';
import { validateEntryData, validateFieldDefinitions } from '../domain/fields/validator.js';

type Ctx = { userId?: string };

type FieldDef = {
  key: string;
  type: string;
  config?: { fields?: FieldDef[]; contentTypeId?: string };
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveEntrySlug(
  contentType: { options?: Record<string, unknown> },
  data: Record<string, unknown>,
  inputSlug?: string | null,
) {
  const hasSlug = Boolean(contentType.options?.hasSlug);
  if (!hasSlug) return null;

  const direct = typeof inputSlug === 'string' ? toSlug(inputSlug) : '';
  if (direct) return direct;

  const slugFieldKey = typeof contentType.options?.slugFieldKey === 'string' ? contentType.options.slugFieldKey : '';
  if (slugFieldKey) {
    const sourceValue = data[slugFieldKey];
    if (typeof sourceValue === 'string') {
      const generated = toSlug(sourceValue);
      if (generated) return generated;
    }
  }

  throw new Error('Slug is required for this content type');
}

function toId(doc: any) {
  return { ...doc, id: String(doc._id), _id: undefined };
}

function buildAssetUrls(asset: any) {
  const storage = getStorageAdapter();
  return {
    original: storage.getDataUrl(asset.storageKeyOriginal, asset.mimeType),
    web: storage.getDataUrl(asset.storageKeyWeb, 'image/webp'),
    thumbnail: storage.getDataUrl(asset.storageKeyThumb, 'image/webp'),
  };
}

async function toAsset(asset: any) {
  return {
    id: String(asset._id),
    siteId: String(asset.siteId),
    uploadedBy: String(asset.uploadedBy),
    filename: asset.filename,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width ?? null,
    height: asset.height ?? null,
    alt: asset.alt ?? '',
    title: asset.title ?? '',
    variants: await buildAssetUrls(asset),
    createdAt: new Date(asset.createdAt).toISOString(),
    updatedAt: new Date(asset.updatedAt).toISOString(),
  };
}

function collectImageAssetIds(fields: FieldDef[], data: Record<string, unknown>): string[] {
  const assetIds: string[] = [];
  for (const field of fields) {
    const value = data[field.key];
    if (!value) continue;

    if (field.type === 'image' && typeof value === 'object' && !Array.isArray(value)) {
      const assetId = (value as Record<string, unknown>).assetId;
      if (typeof assetId === 'string' && assetId) assetIds.push(assetId);
    }

    if (field.type === 'repeater' && Array.isArray(value)) {
      const nestedFields = (field.config?.fields ?? []) as FieldDef[];
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          assetIds.push(...collectImageAssetIds(nestedFields, item as Record<string, unknown>));
        }
      }
    }
  }
  return assetIds;
}

function collectRepeaterContentTypeIds(fields: FieldDef[]): string[] {
  const ids: string[] = [];
  for (const field of fields) {
    if (field.type === 'repeater') {
      const refId = field.config?.contentTypeId;
      if (typeof refId === 'string' && refId) ids.push(refId);
      const nested = (field.config?.fields ?? []) as FieldDef[];
      ids.push(...collectRepeaterContentTypeIds(nested));
    }
  }
  return ids;
}

async function assertReferencedContentTypesExist(siteId: string, fields: FieldDef[], currentContentTypeId?: string) {
  const referencedIds = [...new Set(collectRepeaterContentTypeIds(fields))];
  if (!referencedIds.length) return;
  if (currentContentTypeId && referencedIds.includes(currentContentTypeId)) {
    throw new Error('Repeater cannot reference itself');
  }

  const existing = await ContentTypeModel.find({ _id: { $in: referencedIds }, siteId }).select({ _id: 1 }).lean();
  const existingIds = new Set(existing.map((item) => String(item._id)));
  const missing = referencedIds.filter((id) => !existingIds.has(String(id)));
  if (missing.length) throw new Error('One or more referenced repeater content types do not exist in this site');
}

async function hydrateRepeaterFields(siteId: string, fields: FieldDef[], visited = new Set<string>()): Promise<FieldDef[]> {
  const hydrated: FieldDef[] = [];
  for (const field of fields) {
    if (field.type !== 'repeater') {
      hydrated.push(field);
      continue;
    }

    const contentTypeId = field.config?.contentTypeId;
    if (typeof contentTypeId === 'string' && contentTypeId) {
      if (visited.has(contentTypeId)) throw new Error('Circular repeater content type reference detected');
      const referenced = await ContentTypeModel.findOne({ _id: contentTypeId, siteId }).lean();
      if (!referenced) throw new Error('Referenced repeater content type not found');
      visited.add(contentTypeId);
      const nested = await hydrateRepeaterFields(siteId, referenced.fields as FieldDef[], visited);
      visited.delete(contentTypeId);
      hydrated.push({
        ...field,
        config: {
          ...(field.config ?? {}),
          fields: nested,
        },
      });
      continue;
    }

    const nested = await hydrateRepeaterFields(siteId, ((field.config?.fields ?? []) as FieldDef[]), visited);
    hydrated.push({
      ...field,
      config: {
        ...(field.config ?? {}),
        fields: nested,
      },
    });
  }
  return hydrated;
}

function entryContainsAsset(value: unknown, assetId: string): boolean {
  if (!value) return false;
  if (Array.isArray(value)) return value.some((item) => entryContainsAsset(item, assetId));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.assetId === assetId) return true;
    return Object.values(record).some((nested) => entryContainsAsset(nested, assetId));
  }
  return false;
}

async function assertAssetsBelongToSite(siteId: string, assetIds: string[]) {
  if (!assetIds.length) return;
  const assets = await AssetModel.find({ _id: { $in: assetIds }, siteId }).lean();
  const found = new Set(assets.map((asset) => String(asset._id)));
  const missing = assetIds.filter((id) => !found.has(String(id)));
  if (missing.length) throw new Error('One or more referenced assets are missing or outside this site');
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
  ContentType: {
    options: (parent: any) => parent.options ?? {},
  },
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
      const entries = await EntryModel.find({ siteId, contentTypeId }).sort({ updatedAt: -1 }).skip(offset).limit(limit).lean();
      const editorIds = [...new Set(entries.map((entry) => (entry.updatedBy ? String(entry.updatedBy) : '')).filter(Boolean))];
      const editors = await UserModel.find({ _id: { $in: editorIds } }).select({ _id: 1, email: 1 }).lean();
      const editorMap = new Map(editors.map((editor) => [String(editor._id), editor]));
      return entries.map((entry) => ({
        ...toId(entry),
        updatedAt: new Date(entry.updatedAt ?? Date.now()).toISOString(),
        lastEditedBy: entry.updatedBy
          ? {
              id: String(entry.updatedBy),
              email: editorMap.get(String(entry.updatedBy))?.email ?? 'Unknown',
            }
          : null,
      }));
    },
    listAssets: async (_: unknown, { siteId, query = '', limit = 30, offset = 0 }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'viewer');

      const filter: Record<string, unknown> = { siteId };
      if (query.trim()) filter.filename = { $regex: query.trim(), $options: 'i' };

      const assets = await AssetModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
      return Promise.all(assets.map(toAsset));
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

      await MembershipModel.findOneAndUpdate({ userId, siteId }, { role }, { upsert: true, new: true });

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
    createContentType: async (_: unknown, { siteId, name, slug, fields, options = {} }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      const safeFields = validateFieldDefinitions(fields);
      await assertReferencedContentTypesExist(siteId, safeFields as FieldDef[]);
      const normalizedSlug = toSlug(String(slug ?? ''));
      if (!normalizedSlug) throw new Error('Content type URL key could not be derived from the name');
      try {
        const ct = await ContentTypeModel.create({
          siteId,
          name,
          slug: normalizedSlug,
          fields: safeFields,
          options,
        });
        return toId(ct.toObject());
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 11000) {
          throw new Error('A content type with this URL key already exists in this workspace.');
        }
        throw error;
      }
    },
    updateContentType: async (_: unknown, { id, siteId, ...rest }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      if (rest.fields) {
        rest.fields = validateFieldDefinitions(rest.fields);
        await assertReferencedContentTypesExist(siteId, rest.fields as FieldDef[], id);
      }
      if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
        if (rest.slug == null || rest.slug === '') {
          delete rest.slug;
        } else {
          rest.slug = toSlug(String(rest.slug));
        }
      }
      try {
        const ct = await ContentTypeModel.findOneAndUpdate({ _id: id, siteId }, rest, { new: true });
        if (!ct) throw new Error('Content type not found');
        return toId(ct.toObject());
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Content type not found') throw error;
        if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 11000) {
          throw new Error('A content type with this URL key already exists in this workspace.');
        }
        throw error;
      }
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
      const hydratedFields = await hydrateRepeaterFields(siteId, contentType.fields as FieldDef[]);
      validateEntryData(hydratedFields as any, data as Record<string, unknown>);
      await assertAssetsBelongToSite(siteId, collectImageAssetIds(hydratedFields as FieldDef[], data as Record<string, unknown>));
      const resolvedSlug = resolveEntrySlug(contentType as any, data as Record<string, unknown>, slug);
      const entry = await EntryModel.create({ siteId, contentTypeId, slug: resolvedSlug, data, updatedBy: ctx.userId });
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
        const hydratedFields = await hydrateRepeaterFields(siteId, ct.fields as FieldDef[]);
        validateEntryData(hydratedFields as any, rest.data as Record<string, unknown>);
        await assertAssetsBelongToSite(siteId, collectImageAssetIds(hydratedFields as FieldDef[], rest.data as Record<string, unknown>));
        if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
          rest.slug = resolveEntrySlug(ct as any, rest.data as Record<string, unknown>, rest.slug);
        }
      } else if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
        const ct = await ContentTypeModel.findOne({ _id: current.contentTypeId, siteId }).lean();
        if (!ct) throw new Error('Content type not found');
        rest.slug = resolveEntrySlug(ct as any, (current.data ?? {}) as Record<string, unknown>, rest.slug);
      }
      const entry = await EntryModel.findOneAndUpdate({ _id: id, siteId }, { ...rest, updatedBy: ctx.userId }, { new: true });
      if (!entry) throw new Error('Entry not found');
      return toId(entry.toObject());
    },
    deleteEntry: async (_: unknown, { id, siteId }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      await EntryModel.deleteOne({ _id: id, siteId });
      return true;
    },
    uploadAsset: async (_: unknown, { siteId, fileBase64, filename, mimeType, alt = '', title = '' }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');

      const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
      if (!allowed.has(mimeType)) throw new Error('Unsupported mime type');

      const original = Buffer.from(fileBase64, 'base64');
      if (!original.byteLength) throw new Error('Empty upload');

      if (original.byteLength > env.assetMaxUploadBytes) throw new Error('Upload exceeds file size limit');

      const safeFilename = sanitizeFilename(filename || 'asset');
      const keyPrefix = normalizeStorageKey(`${siteId}/${Date.now()}-${safeFilename}`);
      const storage = getStorageAdapter();
      const variants = await buildImageVariants(original, mimeType);

      const originalKey = `${keyPrefix}/original`;
      const webKey = `${keyPrefix}/web.webp`;
      const thumbKey = `${keyPrefix}/thumbnail.webp`;

      await storage.put(originalKey, original, mimeType);
      await storage.put(webKey, variants.web, 'image/webp');
      await storage.put(thumbKey, variants.thumbnail, 'image/webp');

      const asset = await AssetModel.create({
        siteId,
        uploadedBy: ctx.userId,
        filename: safeFilename,
        mimeType,
        sizeBytes: original.byteLength,
        width: variants.width,
        height: variants.height,
        alt,
        title,
        storageKeyOriginal: originalKey,
        storageKeyWeb: webKey,
        storageKeyThumb: thumbKey,
      });

      return toAsset(asset.toObject());
    },
    updateAssetMeta: async (_: unknown, { id, siteId, alt = '', title = '' }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      const asset = await AssetModel.findOneAndUpdate({ _id: id, siteId }, { alt, title }, { new: true }).lean();
      if (!asset) throw new Error('Asset not found');
      return toAsset(asset);
    },
    deleteAsset: async (_: unknown, { id, siteId }: any, ctx: Ctx) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');

      const entries = await EntryModel.find({ siteId }).select({ data: 1 }).lean();
      const inUse = entries.some((entry) => entryContainsAsset(entry.data, String(id)));
      if (inUse) throw new Error('Asset is referenced by an entry');

      const asset = await AssetModel.findOneAndDelete({ _id: id, siteId }).lean();
      if (!asset) return true;
      const storage = getStorageAdapter();
      await Promise.all([
        storage.delete(asset.storageKeyOriginal),
        storage.delete(asset.storageKeyWeb),
        storage.delete(asset.storageKeyThumb),
      ]);
      return true;
    },
  },
};
