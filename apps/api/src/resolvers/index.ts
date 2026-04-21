import { GraphQLJSON } from 'graphql-scalars';
import { formatApiKeyToken, generateApiKeySecret, hashApiKeySecret } from '../auth/api-key.js';
import { requireReadSite, requireRole, type RequestContext } from '../auth/rbac.js';
import { assertStrongPassword, compareBootstrapSecret } from '../auth/password-policy.js';
import { comparePassword, hashPassword, signToken } from '../auth/security.js';
import { env } from '../config/env.js';
import { exportSiteBundleService, importSiteBundleService } from '../site/site-bundle-service.js';
import { getStorageAdapter } from '../assets/index.js';
import { mimeForDerivativeKey } from '../assets/image.js';
import { persistImageUpload } from '../assets/persist-image-upload.js';
import { ContentTypeModel } from '../db/models/ContentType.js';
import { EntryModel } from '../db/models/Entry.js';
import { AssetModel } from '../db/models/Asset.js';
import { MembershipModel, roles } from '../db/models/Membership.js';
import { SiteModel } from '../db/models/Site.js';
import { MENU_SLOT_KEY_PATTERN, MENU_SLOT_MAX_SLOTS, SiteSettingsModel } from '../db/models/SiteSettings.js';
import { ApiKeyModel } from '../db/models/ApiKey.js';
import { UserModel } from '../db/models/User.js';
import {
  assertReferencedContentTypesExist,
  hydrateRepeaterFields,
  type FieldDef,
} from '../domain/fields/repeater-hydrate.js';
import { validateEntryData, validateFieldDefinitions } from '../domain/fields/validator.js';

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const ENTRY_NAME_MAX = 200;

function normalizeEntryName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Display name is required.');
  const t = raw.trim();
  if (!t) throw new Error('Display name is required.');
  if (t.length > ENTRY_NAME_MAX) throw new Error(`Display name must be at most ${ENTRY_NAME_MAX} characters.`);
  return t;
}

async function assertEntryNameUnique(
  siteId: unknown,
  contentTypeId: unknown,
  name: string,
  excludeEntryId?: string,
) {
  const filter: Record<string, unknown> = { siteId, contentTypeId, name };
  if (excludeEntryId) filter._id = { $ne: excludeEntryId };
  const clash = await EntryModel.findOne(filter).select({ _id: 1 }).lean();
  if (clash) throw new Error('An entry with this name already exists for this content type.');
}

function resolveEntrySlug(
  contentType: { options?: Record<string, unknown> },
  data: Record<string, unknown>,
  inputSlug?: string | null,
  displayName?: string | null,
) {
  const hasSlug = Boolean(contentType.options?.hasSlug);
  if (!hasSlug) return null;

  const direct = typeof inputSlug === 'string' ? toSlug(inputSlug) : '';
  if (direct) return direct;

  const fromDisplayName = typeof displayName === 'string' && displayName.trim() ? toSlug(displayName) : '';
  if (fromDisplayName) return fromDisplayName;

  throw new Error('Slug is required for this content type');
}

function toId(doc: any) {
  return { ...doc, id: String(doc._id), _id: undefined };
}

async function entryDocumentToGql(entry: any) {
  let lastEditedBy: { id: string; email: string } | null = null;
  if (entry.updatedBy) {
    const editor = await UserModel.findById(entry.updatedBy).select({ email: 1 }).lean();
    lastEditedBy = {
      id: String(entry.updatedBy),
      email: editor?.email ?? 'Unknown',
    };
  }
  return {
    ...toId(entry),
    siteId: String(entry.siteId),
    contentTypeId: String(entry.contentTypeId),
    name: typeof entry.name === 'string' ? entry.name : '',
    updatedAt: new Date(entry.updatedAt ?? Date.now()).toISOString(),
    lastEditedBy,
  };
}

function formatApiKeyDoc(doc: {
  _id: unknown;
  siteId: unknown;
  name: string;
  keyHint: string;
  createdAt: Date;
  lastUsedAt?: Date | null;
}) {
  return {
    id: String(doc._id),
    siteId: String(doc.siteId),
    name: doc.name,
    keyHint: doc.keyHint,
    createdAt: new Date(doc.createdAt).toISOString(),
    lastUsedAt: doc.lastUsedAt ? new Date(doc.lastUsedAt).toISOString() : null,
  };
}

async function buildAssetUrls(asset: any) {
  const storage = getStorageAdapter();

  const url = (key: string | null | undefined, mime?: string) =>
    key ? storage.getDataUrl(key, mime ?? mimeForDerivativeKey(key)) : Promise.resolve(null);

   const [original, web, thumbnail, small, medium, xlarge] = await Promise.all([
    url(asset.storageKeyOriginal, asset.mimeType),
    url(asset.storageKeyWeb),
    url(asset.storageKeyThumb),
    url(asset.storageKeySmall),
    url(asset.storageKeyMedium),
    url(asset.storageKeyXlarge),
  ]);

  if (!original || !web || !thumbnail) throw new Error('Asset missing required storage keys');

  return {
    original,
    web,
    thumbnail,
    small,
    medium,
    large: web,
    xlarge,
  };
}

function normalizeFocal01(value: unknown, fallback = 0.5) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
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
    focalPoint: {
      x: normalizeFocal01(asset.focalX),
      y: normalizeFocal01(asset.focalY),
    },
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

function normalizeMenuEntries(raw: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return map;
  const record = raw as Record<string, unknown>;
  const seen = new Set<string>();
  for (const [rawKey, value] of Object.entries(record)) {
    const key = String(rawKey).trim();
    if (!key) continue;
    if (!MENU_SLOT_KEY_PATTERN.test(key)) {
      throw new Error(
        `Invalid menu slot key "${key}". Use a letter to start, then letters, numbers, underscores, or hyphens (1–64 characters).`,
      );
    }
    if (seen.has(key)) {
      throw new Error(`Duplicate menu slot key "${key}".`);
    }
    seen.add(key);
    if (typeof value === 'string' && value.trim()) {
      map.set(key, value.trim());
    }
  }
  if (map.size > MENU_SLOT_MAX_SLOTS) {
    throw new Error(`At most ${MENU_SLOT_MAX_SLOTS} menu slots are allowed.`);
  }
  return map;
}

function menuEntriesToObject(mapOrRecord: unknown): Record<string, string> {
  if (!mapOrRecord) return {};
  if (mapOrRecord instanceof Map) {
    const out: Record<string, string> = {};
    for (const [k, v] of mapOrRecord) {
      const key = String(k).trim();
      if (!key || typeof v !== 'string' || !v.trim()) continue;
      out[key] = v.trim();
    }
    return out;
  }
  if (typeof mapOrRecord === 'object' && !Array.isArray(mapOrRecord)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(mapOrRecord as Record<string, unknown>)) {
      const key = k.trim();
      if (!key || typeof v !== 'string' || !v.trim()) continue;
      out[key] = v.trim();
    }
    return out;
  }
  return {};
}

async function assertEntriesBelongToSite(siteId: string, entryIds: string[]) {
  const unique = [...new Set(entryIds.filter(Boolean))];
  if (!unique.length) return;
  const entries = await EntryModel.find({ _id: { $in: unique }, siteId }).select({ _id: 1 }).lean();
  const found = new Set(entries.map((e) => String(e._id)));
  const missing = unique.filter((id) => !found.has(String(id)));
  if (missing.length) throw new Error('One or more referenced entries are missing or outside this site');
}

async function entryReferencedBySiteSettings(siteId: string, entryId: string): Promise<boolean> {
  const doc = await SiteSettingsModel.findOne({ siteId }).select({ menuEntries: 1 }).lean();
  if (!doc?.menuEntries) return false;
  const obj = menuEntriesToObject(doc.menuEntries);
  return Object.values(obj).some((id) => String(id) === String(entryId));
}

async function assetReferencedBySiteSettings(siteId: string, assetId: string): Promise<boolean> {
  const doc = await SiteSettingsModel.findOne({ siteId }).select({ logoAssetId: 1, faviconAssetId: 1 }).lean();
  if (!doc) return false;
  const id = String(assetId);
  const logo = doc.logoAssetId ? String(doc.logoAssetId) : '';
  const fav = doc.faviconAssetId ? String(doc.faviconAssetId) : '';
  return logo === id || fav === id;
}

function siteSettingsDocToGql(doc: {
  _id: unknown;
  siteId: unknown;
  logoAssetId?: unknown;
  faviconAssetId?: unknown;
  siteTitle?: string | null;
  menuEntries?: unknown;
}) {
  return {
    id: String(doc._id),
    siteId: String(doc.siteId),
    logoAssetId: doc.logoAssetId ? String(doc.logoAssetId) : null,
    faviconAssetId: doc.faviconAssetId ? String(doc.faviconAssetId) : null,
    siteTitle: typeof doc.siteTitle === 'string' && doc.siteTitle.trim() ? doc.siteTitle.trim() : null,
    menuEntries: menuEntriesToObject(doc.menuEntries),
  };
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
  SiteSettings: {
    logo: async (parent: { siteId: string; logoAssetId?: string | null }) => {
      if (!parent.logoAssetId) return null;
      const asset = await AssetModel.findOne({ _id: parent.logoAssetId, siteId: parent.siteId }).lean();
      return asset ? toAsset(asset) : null;
    },
    favicon: async (parent: { siteId: string; faviconAssetId?: string | null }) => {
      if (!parent.faviconAssetId) return null;
      const asset = await AssetModel.findOne({ _id: parent.faviconAssetId, siteId: parent.siteId }).lean();
      return asset ? toAsset(asset) : null;
    },
    menusResolved: async (parent: { siteId: string; menuEntries: unknown }) => {
      const obj = menuEntriesToObject(parent.menuEntries);
      const slots = Object.keys(obj).sort();
      return Promise.all(
        slots.map(async (slot) => {
          const entryId = obj[slot];
          if (!entryId) return { slot, entry: null };
          const doc = await EntryModel.findOne({ _id: entryId, siteId: parent.siteId }).lean();
          return { slot, entry: doc ? await entryDocumentToGql(doc) : null };
        }),
      );
    },
  },
  ContentType: {
    options: (parent: any) => parent.options ?? {},
  },
  Query: {
    bootstrapAuthStatus: () => ({
      initialPasswordRequiresSecret: Boolean(env.bootstrapSecret),
    }),
    me: async (_: unknown, __: unknown, ctx: RequestContext) => {
      if (!ctx.userId) return null;
      const user = await UserModel.findById(ctx.userId).lean();
      return user ? toId(user) : null;
    },
    listMySites: async (_: unknown, __: unknown, ctx: RequestContext) => {
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
      ctx: RequestContext,
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
    contentTypes: async (_: unknown, { siteId }: { siteId: string }, ctx: RequestContext) => {
      await requireReadSite(ctx, siteId);
      return (await ContentTypeModel.find({ siteId }).lean()).map(toId);
    },
    entries: async (_: unknown, { siteId, contentTypeId, limit = 30, offset = 0 }: any, ctx: RequestContext) => {
      await requireReadSite(ctx, siteId);
      const entries = await EntryModel.find({ siteId, contentTypeId }).sort({ updatedAt: -1 }).skip(offset).limit(limit).lean();
      const editorIds = [...new Set(entries.map((entry) => (entry.updatedBy ? String(entry.updatedBy) : '')).filter(Boolean))];
      const editors = await UserModel.find({ _id: { $in: editorIds } }).select({ _id: 1, email: 1 }).lean();
      const editorMap = new Map(editors.map((editor) => [String(editor._id), editor]));
      return entries.map((entry) => ({
        ...toId(entry),
        siteId: String(entry.siteId),
        contentTypeId: String(entry.contentTypeId),
        name: typeof entry.name === 'string' ? entry.name : '',
        updatedAt: new Date(entry.updatedAt ?? Date.now()).toISOString(),
        lastEditedBy: entry.updatedBy
          ? {
              id: String(entry.updatedBy),
              email: editorMap.get(String(entry.updatedBy))?.email ?? 'Unknown',
            }
          : null,
      }));
    },
    entry: async (_: unknown, { id, siteId }: { id: string; siteId: string }, ctx: RequestContext) => {
      await requireReadSite(ctx, siteId);
      const doc = await EntryModel.findOne({ _id: id, siteId }).lean();
      if (!doc) return null;
      return entryDocumentToGql(doc);
    },
    entryBySlug: async (
      _: unknown,
      { siteId, contentTypeSlug, slug }: { siteId: string; contentTypeSlug: string; slug: string },
      ctx: RequestContext,
    ) => {
      await requireReadSite(ctx, siteId);
      const ct = await ContentTypeModel.findOne({ siteId, slug: contentTypeSlug }).lean();
      if (!ct) return null;
      const doc = await EntryModel.findOne({ siteId, contentTypeId: ct._id, slug }).lean();
      if (!doc) return null;
      return entryDocumentToGql(doc);
    },
    listAssets: async (_: unknown, { siteId, query = '', limit = 30, offset = 0 }: any, ctx: RequestContext) => {
      await requireReadSite(ctx, siteId);

      const filter: Record<string, unknown> = { siteId };
      if (query.trim()) filter.filename = { $regex: query.trim(), $options: 'i' };

      const assets = await AssetModel.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit).lean();
      return Promise.all(assets.map(toAsset));
    },
    apiKeys: async (_: unknown, { siteId }: { siteId: string }, ctx: RequestContext) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      const keys = await ApiKeyModel.find({ siteId, revokedAt: null }).sort({ createdAt: -1 }).lean();
      return keys.map(formatApiKeyDoc);
    },
    exportSiteBundle: async (_: unknown, { siteId, options }: { siteId: string; options: Record<string, unknown> }, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      return await exportSiteBundleService(siteId, {
        siteSettings: Boolean(options.siteSettings),
        contentTypes: Boolean(options.contentTypes),
        contentTypeSlugsForEntries: Array.isArray(options.contentTypeSlugsForEntries)
          ? (options.contentTypeSlugsForEntries as string[])
          : [],
        assets: Boolean(options.assets),
      });
    },
    siteSettings: async (_: unknown, { siteId }: { siteId: string }, ctx: RequestContext) => {
      await requireReadSite(ctx, siteId);
      const doc = await SiteSettingsModel.findOne({ siteId }).lean();
      if (!doc) {
        return {
          id: null,
          siteId,
          logoAssetId: null,
          faviconAssetId: null,
          siteTitle: null,
          menuEntries: {},
        };
      }
      return siteSettingsDocToGql(doc);
    },
  },
  Mutation: {
    register: async (_: unknown, { email, password }: { email: string; password: string }) => {
      assertStrongPassword(password);
      const existing = await UserModel.findOne({ email: email.toLowerCase() });
      if (existing) throw new Error('Email already in use');
      const user = await UserModel.create({ email: email.toLowerCase(), passwordHash: await hashPassword(password) });
      return { token: signToken({ userId: String(user._id) }), user: toId(user.toObject()) };
    },
    login: async (_: unknown, { email, password, siteId }: { email: string; password?: string | null; siteId?: string | null }) => {
      const user = await UserModel.findOne({ email: email.toLowerCase() });
      if (!user) throw new Error('Invalid credentials');
      const pass = typeof password === 'string' ? password : '';
      if (!user.passwordHash) {
        if (!user.isAdmin) throw new Error('Invalid credentials');
        return { token: null, requiresPasswordSetup: true, user: toId(user.toObject()) };
      }
      if (!pass.length) throw new Error('Password is required');
      if (!(await comparePassword(pass, user.passwordHash))) throw new Error('Invalid credentials');
      return {
        token: signToken({ userId: String(user._id), siteId: siteId ?? undefined }),
        requiresPasswordSetup: false,
        user: toId(user.toObject()),
      };
    },
    setInitialPassword: async (
      _: unknown,
      {
        email,
        newPassword,
        bootstrapSecret,
      }: { email: string; newPassword: string; bootstrapSecret?: string | null },
    ) => {
      if (!env.bootstrapAdminEmail) {
        throw new Error('Initial password setup is not enabled (BOOTSTRAP_ADMIN_EMAIL is not set).');
      }
      if (env.bootstrapSecret && !compareBootstrapSecret(bootstrapSecret ?? undefined, env.bootstrapSecret)) {
        throw new Error('Invalid setup credentials');
      }
      const normalized = email.toLowerCase().trim();
      if (normalized !== env.bootstrapAdminEmail) {
        throw new Error('Invalid setup credentials');
      }
      assertStrongPassword(newPassword);
      const user = await UserModel.findOne({ email: normalized });
      if (!user) throw new Error('User not found');
      if (user.passwordHash) throw new Error('Password already set; sign in with your password instead.');
      if (!user.isAdmin) throw new Error('Access denied');
      const updated = await UserModel.findByIdAndUpdate(
        user._id,
        { passwordHash: await hashPassword(newPassword) },
        { new: true },
      );
      if (!updated) throw new Error('User not found');
      return { token: signToken({ userId: String(updated._id) }), user: toId(updated.toObject()) };
    },
    createSite: async (_: unknown, { name, url }: { name: string; url: string }, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const creator = await UserModel.findById(ctx.userId).lean();
      if (!creator?.isAdmin) throw new Error('Only admins can create new sites');
      const site = await SiteModel.create({ name, url, ownerId: ctx.userId });
      await MembershipModel.create({ userId: ctx.userId, siteId: site._id, role: 'owner' });
      return toId(site.toObject());
    },
    updateSite: async (
      _: unknown,
      { siteId, name, url }: { siteId: string; name?: string | null; url?: string | null },
      ctx: RequestContext,
    ) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');

      const $set: Record<string, string> = {};
      if (name !== undefined && name !== null) {
        const n = String(name).trim();
        if (!n) throw new Error('Site name cannot be empty');
        $set.name = n;
      }
      if (url !== undefined && url !== null) {
        const u = String(url).trim();
        if (!u) throw new Error('Site URL cannot be empty');
        $set.url = u;
      }
      if (!Object.keys($set).length) throw new Error('No changes to save');

      try {
        const site = await SiteModel.findOneAndUpdate({ _id: siteId }, { $set }, { new: true }).lean();
        if (!site) throw new Error('Site not found');
        const membership = await MembershipModel.findOne({ userId: ctx.userId, siteId }).lean();
        return { ...toId(site), url: (site as { url?: string }).url ?? '', role: membership?.role };
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 11000) {
          throw new Error('A site with this URL already exists');
        }
        throw error;
      }
    },
    createGlobalUser: async (_: unknown, { email, password, status = 'active', isAdmin = false }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      assertStrongPassword(password);
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
    updateUserStatus: async (_: unknown, { userId, status }: any, ctx: RequestContext) => {
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
    setUserAdmin: async (_: unknown, { userId, isAdmin }: { userId: string; isAdmin: boolean }, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const currentUser = await UserModel.findById(ctx.userId).lean();
      if (!currentUser?.isAdmin) throw new Error('Only admins can change admin access');
      const user = await UserModel.findByIdAndUpdate(userId, { isAdmin }, { new: true });
      if (!user) throw new Error('User not found');
      return toGlobalUser(String(user._id));
    },
    setUserSiteRole: async (_: unknown, { userId, siteId, role }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      if (!roles.includes(role)) throw new Error('Invalid role');

      const user = await UserModel.findById(userId).lean();
      if (!user) throw new Error('User not found');

      await MembershipModel.findOneAndUpdate({ userId, siteId }, { role }, { upsert: true, new: true });

      return toGlobalUser(String(userId));
    },
    removeUserSiteAccess: async (_: unknown, { userId, siteId }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      await MembershipModel.deleteOne({ userId, siteId });
      return toGlobalUser(String(userId));
    },
    inviteUser: async (_: unknown, { siteId, email, role }: any, ctx: RequestContext) => {
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
    setRole: async (_: unknown, { siteId, userId, role }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      if (!roles.includes(role)) throw new Error('Invalid role');
      const membership = await MembershipModel.findOneAndUpdate({ userId, siteId }, { role }, { new: true });
      if (!membership) throw new Error('Membership not found');
      return toId(membership.toObject());
    },
    createContentType: async (_: unknown, { siteId, name, slug, fields, options = {} }: any, ctx: RequestContext) => {
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
    updateContentType: async (_: unknown, { id, siteId, ...rest }: any, ctx: RequestContext) => {
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
    deleteContentType: async (_: unknown, { id, siteId }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      await ContentTypeModel.deleteOne({ _id: id, siteId });
      return true;
    },
    createEntry: async (_: unknown, { siteId, contentTypeId, name, slug, data }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      const contentType = await ContentTypeModel.findOne({ _id: contentTypeId, siteId }).lean();
      if (!contentType) throw new Error('Content type not found');
      const displayName = normalizeEntryName(name);
      await assertEntryNameUnique(siteId, contentTypeId, displayName);
      const hydratedFields = await hydrateRepeaterFields(siteId, contentType.fields as FieldDef[]);
      validateEntryData(hydratedFields as any, data as Record<string, unknown>);
      await assertAssetsBelongToSite(siteId, collectImageAssetIds(hydratedFields as FieldDef[], data as Record<string, unknown>));
      const resolvedSlug = resolveEntrySlug(contentType as any, data as Record<string, unknown>, slug, displayName);
      const entry = await EntryModel.create({
        siteId,
        contentTypeId,
        name: displayName,
        slug: resolvedSlug,
        data,
        updatedBy: ctx.userId,
      });
      return entryDocumentToGql(entry.toObject());
    },
    updateEntry: async (_: unknown, { id, siteId, ...rest }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      const current = await EntryModel.findOne({ _id: id, siteId }).lean();
      if (!current) throw new Error('Entry not found');
      if (Object.prototype.hasOwnProperty.call(rest, 'name')) {
        const displayName = normalizeEntryName(rest.name);
        await assertEntryNameUnique(siteId, current.contentTypeId, displayName, id);
        rest.name = displayName;
      }
      const nameForSlugResolution =
        typeof rest.name === 'string' ? rest.name : typeof current.name === 'string' ? current.name : null;

      if (rest.data) {
        const ct = await ContentTypeModel.findOne({ _id: current.contentTypeId, siteId }).lean();
        if (!ct) throw new Error('Content type not found');
        const hydratedFields = await hydrateRepeaterFields(siteId, ct.fields as FieldDef[]);
        validateEntryData(hydratedFields as any, rest.data as Record<string, unknown>);
        await assertAssetsBelongToSite(siteId, collectImageAssetIds(hydratedFields as FieldDef[], rest.data as Record<string, unknown>));
        if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
          rest.slug = resolveEntrySlug(ct as any, rest.data as Record<string, unknown>, rest.slug, nameForSlugResolution);
        }
      } else if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
        const ct = await ContentTypeModel.findOne({ _id: current.contentTypeId, siteId }).lean();
        if (!ct) throw new Error('Content type not found');
        rest.slug = resolveEntrySlug(ct as any, (current.data ?? {}) as Record<string, unknown>, rest.slug, nameForSlugResolution);
      }
      const entry = await EntryModel.findOneAndUpdate({ _id: id, siteId }, { ...rest, updatedBy: ctx.userId }, { new: true });
      if (!entry) throw new Error('Entry not found');
      return entryDocumentToGql(entry.toObject());
    },
    deleteEntry: async (_: unknown, { id, siteId }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      if (await entryReferencedBySiteSettings(siteId, String(id))) {
        throw new Error('Entry is assigned to a menu slot in site settings. Unassign it first.');
      }
      await EntryModel.deleteOne({ _id: id, siteId });
      return true;
    },
    uploadAsset: async (_: unknown, { siteId, fileBase64, filename, mimeType, alt = '', title = '' }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      const id = await persistImageUpload({
        siteId,
        userId: ctx.userId,
        fileBase64,
        filename,
        mimeType,
        alt,
        title,
      });
      const asset = await AssetModel.findById(id).lean();
      if (!asset) throw new Error('Asset not found');
      return toAsset(asset);
    },
    updateAssetMeta: async (_: unknown, { id, siteId, alt, title, focalX, focalY }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');
      const $set: Record<string, unknown> = {};
      if (alt !== undefined) $set.alt = alt ?? '';
      if (title !== undefined) $set.title = title ?? '';
      if (focalX !== undefined) $set.focalX = normalizeFocal01(Number(focalX));
      if (focalY !== undefined) $set.focalY = normalizeFocal01(Number(focalY));
      if (!Object.keys($set).length) throw new Error('No fields to update');
      const asset = await AssetModel.findOneAndUpdate({ _id: id, siteId }, { $set }, { new: true }).lean();
      if (!asset) throw new Error('Asset not found');
      return toAsset(asset);
    },
    deleteAsset: async (_: unknown, { id, siteId }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');

      if (await assetReferencedBySiteSettings(siteId, String(id))) {
        throw new Error('Asset is used as site logo or favicon. Remove it from site settings first.');
      }

      const entries = await EntryModel.find({ siteId }).select({ data: 1 }).lean();
      const inUse = entries.some((entry) => entryContainsAsset(entry.data, String(id)));
      if (inUse) throw new Error('Asset is referenced by an entry');

      const asset = await AssetModel.findOneAndDelete({ _id: id, siteId }).lean();
      if (!asset) return true;
      const storage = getStorageAdapter();
      const keys = [
        asset.storageKeyOriginal,
        asset.storageKeyWeb,
        asset.storageKeyThumb,
        asset.storageKeySmall,
        asset.storageKeyMedium,
        asset.storageKeyXlarge,
      ].filter((key): key is string => Boolean(key));
      await Promise.all(keys.map((key) => storage.delete(key)));
      return true;
    },
    createApiKey: async (_: unknown, { siteId, name }: { siteId: string; name: string }, ctx: RequestContext) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      const secret = generateApiKeySecret();
      const doc = await ApiKeyModel.create({
        siteId,
        name: String(name ?? '').trim() || 'API key',
        secretHash: hashApiKeySecret(secret),
        keyHint: secret.slice(-6),
        createdBy: ctx.userId,
      });
      const token = formatApiKeyToken(String(doc._id), secret);
      return { apiKey: formatApiKeyDoc(doc.toObject()), token };
    },
    revokeApiKey: async (_: unknown, { id, siteId }: { id: string; siteId: string }, ctx: RequestContext) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      const updated = await ApiKeyModel.findOneAndUpdate(
        { _id: id, siteId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { new: true },
      ).lean();
      if (!updated) throw new Error('API key not found');
      return true;
    },
    updateSiteSettings: async (
      _: unknown,
      {
        siteId,
        input,
      }: {
        siteId: string;
        input: {
          logoAssetId?: string | null;
          faviconAssetId?: string | null;
          siteTitle?: string | null;
          menuEntries?: unknown;
        };
      },
      ctx: RequestContext,
    ) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'editor');

      const existing = await SiteSettingsModel.findOne({ siteId }).lean();

      const nextLogo = Object.prototype.hasOwnProperty.call(input, 'logoAssetId')
        ? input.logoAssetId
        : existing?.logoAssetId
          ? String(existing.logoAssetId)
          : null;
      const nextFav = Object.prototype.hasOwnProperty.call(input, 'faviconAssetId')
        ? input.faviconAssetId
        : existing?.faviconAssetId
          ? String(existing.faviconAssetId)
          : null;
      const nextTitle = Object.prototype.hasOwnProperty.call(input, 'siteTitle')
        ? input.siteTitle
        : existing?.siteTitle ?? null;

      let nextMenu: Map<string, string>;
      if (Object.prototype.hasOwnProperty.call(input, 'menuEntries')) {
        nextMenu = normalizeMenuEntries(input.menuEntries);
      } else if (existing?.menuEntries) {
        nextMenu = normalizeMenuEntries(menuEntriesToObject(existing.menuEntries));
      } else {
        nextMenu = new Map();
      }

      function normalizeAssetRef(value: string | null | undefined): string | null {
        if (value == null) return null;
        const s = String(value).trim();
        return s || null;
      }

      const logoId = normalizeAssetRef(nextLogo ?? null);
      const favId = normalizeAssetRef(nextFav ?? null);

      const assetIds: string[] = [];
      if (logoId) assetIds.push(logoId);
      if (favId) assetIds.push(favId);
      await assertAssetsBelongToSite(siteId, assetIds);
      await assertEntriesBelongToSite(siteId, [...nextMenu.values()]);

      const siteTitleNormalized =
        nextTitle === null || nextTitle === undefined
          ? null
          : String(nextTitle).trim() || null;

      const updated = await SiteSettingsModel.findOneAndUpdate(
        { siteId },
        {
          $set: {
            logoAssetId: logoId,
            faviconAssetId: favId,
            siteTitle: siteTitleNormalized,
            menuEntries: nextMenu,
          },
          $setOnInsert: { siteId },
        },
        { upsert: true, new: true },
      ).lean();
      if (!updated) throw new Error('Failed to save site settings');
      return siteSettingsDocToGql(updated);
    },
    importSiteBundle: async (
      _: unknown,
      { siteId, bundle, options }: { siteId: string; bundle: unknown; options: Record<string, unknown> },
      ctx: RequestContext,
    ) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'admin');
      return await importSiteBundleService(siteId, ctx.userId, bundle, {
        siteSettings: Boolean(options.siteSettings),
        contentTypes: Boolean(options.contentTypes),
        contentTypeSlugsForEntries: Array.isArray(options.contentTypeSlugsForEntries)
          ? (options.contentTypeSlugsForEntries as string[])
          : [],
        assets: Boolean(options.assets),
      });
    },
  },
};
