import mongoose from 'mongoose';
import { GraphQLJSON } from 'graphql-scalars';
import { formatApiKeyToken, generateApiKeySecret, hashApiKeySecret } from '../auth/api-key.js';
import { requireReadSite, requireRole, type RequestContext } from '../auth/rbac.js';
import {
  apiKeyHasScope,
  LEGACY_API_KEY_SCOPES,
  normalizeAndValidateScopes,
  requireApiKeyScope,
  resolveSiteId,
  scopesRequireActingUser,
} from '../auth/api-key-scopes.js';
import { assertStrongPassword, compareBootstrapSecret } from '../auth/password-policy.js';
import { encryptPublishPat } from '../auth/publish-webhook-crypto.js';
import { comparePassword, hashPassword, signToken } from '../auth/security.js';
import { env } from '../config/env.js';
import {
  assertPublishGithubIds,
  buildPublishCompletionCallbackUrl,
  buildPublishWebhookPostUrl,
  parseGithubRepoUrl,
  triggerRepositoryDispatch,
} from '../site/publish-webhook-service.js';
import { generateReturnWebhookToken, hashReturnWebhookToken } from '../site/publish-webhook-token.js';
import { bumpSiteContentRevision } from '../site/content-revision.js';
import { fireContentWebhook } from '../site/content-webhook.js';
import {
  activateScheduledEntries,
  entryMatchesPublishedConsumerFilter,
  resolveEntryPayloadForReader,
} from '../site/entry-lifecycle.js';
import {
  buildCanonicalPath,
  buildRouteManifestNodes,
  normalizeContentTypeRoutingOptions,
  slugify,
  type RouteManifestContentType,
  type RouteManifestEntry,
} from '@notecms/routing';
import { appendEntryRevision, applyPublishToEntry, getEntryRevision, listEntryRevisions, type EntryRevisionPayload } from '../site/entry-revision-service.js';
import { getStorageAdapter } from '../assets/index.js';
import { mimeForDerivativeKey } from '../assets/image.js';
import { persistImageUpload } from '../assets/persist-image-upload.js';
import { normalizeFocal01 } from '../assets/focal.js';
import { ContentTypeModel } from '../db/models/ContentType.js';
import { EntryModel } from '../db/models/Entry.js';
import { EntryRevisionModel } from '../db/models/EntryRevision.js';
import { AssetModel } from '../db/models/Asset.js';
import { MembershipModel, roles, type Role } from '../db/models/Membership.js';
import { SiteModel } from '../db/models/Site.js';
import { MENU_SLOT_KEY_PATTERN, MENU_SLOT_MAX_SLOTS, SiteSettingsModel } from '../db/models/SiteSettings.js';
import { ApiKeyModel } from '../db/models/ApiKey.js';
import { UserModel } from '../db/models/User.js';
import { assertReferencedEntriesBelongToSite, withResolvedLatestEntryFields } from '../domain/fields/entries-refs.js';
import {
  assertReferencedContentTypesExist,
  hydrateRepeaterFields,
  type FieldDef,
} from '../domain/fields/repeater-hydrate.js';
import { EntryFieldValidationError } from '../domain/fields/entry-field-validation-error.js';
import { validateEntryData, validateFieldDefinitions } from '../domain/fields/validator.js';
import { GraphQLError } from 'graphql';
import { clampListArgs } from '../lib/list-args.js';
import { bundleMutationResolvers, bundleQueryResolvers } from './bundles.js';
import { backupMutationResolvers, backupQueryResolvers } from './backups.js';
import { escapeRegexLiteral } from '../lib/regex-escape.js';
import {
  assertMetaNotDisabledForMutation,
  emptyEntryMeta,
  entryMetaDiffersFromPublished,
  isMetaTaxonomyEnabled,
  metaPayloadFromDoc,
  metaToStored,
  normalizeEntryMetaInput,
  normalizeMetaTaxonomyOptions,
  publishedMetaPayloadFromDoc,
  resolveEntryMetaForReader,
} from '../site/meta-taxonomy.js';

const ENTRY_NAME_MAX = 200;
const USER_DISPLAY_NAME_MAX = 80;

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
  const filter: Record<string, unknown> = { siteId, contentTypeId, name, deletedAt: null };
  if (excludeEntryId) filter._id = { $ne: excludeEntryId };
  const clash = await EntryModel.findOne(filter).select({ _id: 1 }).lean();
  if (clash) badUserInput('An entry with this name already exists for this content type.', ['name']);
}

function resolveEntrySlug(
  contentType: { options?: Record<string, unknown> },
  data: Record<string, unknown>,
  inputSlug?: string | null,
  displayName?: string | null,
) {
  const hasSlug = Boolean(contentType.options?.hasSlug);
  if (!hasSlug) return null;

  const direct = typeof inputSlug === 'string' ? slugify(inputSlug) : '';
  if (direct) return direct;

  const fromDisplayName = typeof displayName === 'string' && displayName.trim() ? slugify(displayName) : '';
  if (fromDisplayName) return fromDisplayName;

  badUserInput('Slug is required for this content type', ['slug']);
}

function toId(doc: any) {
  return { ...doc, id: String(doc._id), _id: undefined };
}

function badUserInput(message: string, fieldPath: string[]): never {
  throw new GraphQLError(message, {
    extensions: { code: 'BAD_USER_INPUT', fieldPath },
  });
}

function rethrowEntryValidation(err: unknown): never {
  if (err instanceof EntryFieldValidationError) {
    badUserInput(err.message, err.fieldPath);
  }
  throw err;
}

/** Roles a site owner may assign when creating or inviting users (not owner). */
const SITE_OWNER_ASSIGNABLE_ROLES: readonly Role[] = ['viewer', 'editor'];

async function actorIsGlobalAdmin(ctx: RequestContext): Promise<boolean> {
  if (!ctx.userId) return false;
  const actor = await UserModel.findById(ctx.userId).select({ isAdmin: 1 }).lean();
  return Boolean(actor?.isAdmin);
}

async function assertCanConfigurePublishWebhook(ctx: RequestContext, siteId: string) {
  if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
  if (await actorIsGlobalAdmin(ctx)) return;
  await requireRole(ctx.userId, siteId, 'owner');
}

async function entryDocumentToGql(entry: any, ctx: RequestContext) {
  let lastEditedBy: { id: string; email: string } | null = null;
  if (entry.updatedBy) {
    const editor = await UserModel.findById(entry.updatedBy).select({ email: 1 }).lean();
    lastEditedBy = {
      id: String(entry.updatedBy),
      email: editor?.email ?? 'Unknown',
    };
  }
  const raw = entry as Record<string, unknown>;
  const payload = resolveEntryPayloadForReader(raw, ctx);
  const createdAtRaw = raw.createdAt ?? (entry as { createdAt?: Date }).createdAt;
  return {
    ...toId(entry),
    siteId: String(entry.siteId),
    contentTypeId: String(entry.contentTypeId),
    name: payload.name,
    slug: payload.slug,
    data: payload.data,
    meta: resolveEntryMetaForReader(raw, ctx),
    lifecycleStatus: typeof raw.lifecycleStatus === 'string' ? raw.lifecycleStatus : 'published',
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt as Date).toISOString() : null,
    scheduledPublishAt: raw.scheduledPublishAt ? new Date(raw.scheduledPublishAt as Date).toISOString() : null,
    scheduledUnpublishAt: raw.scheduledUnpublishAt ? new Date(raw.scheduledUnpublishAt as Date).toISOString() : null,
    deletedAt: raw.deletedAt ? new Date(raw.deletedAt as Date).toISOString() : null,
    hasUnpublishedChanges: Boolean(raw.hasUnpublishedChanges),
    createdAt: createdAtRaw ? new Date(createdAtRaw as Date).toISOString() : new Date(entry.updatedAt ?? Date.now()).toISOString(),
    updatedAt: new Date(entry.updatedAt ?? Date.now()).toISOString(),
    lastEditedBy,
  };
}

function formatApiKeyDoc(doc: {
  _id: unknown;
  siteId: unknown;
  name: string;
  keyHint: string;
  scopes?: string[] | null;
  actingUserId?: unknown;
  createdAt: Date;
  lastUsedAt?: Date | null;
}) {
  const scopes =
    Array.isArray(doc.scopes) && doc.scopes.length > 0 ? [...doc.scopes] : [...LEGACY_API_KEY_SCOPES];
  return {
    id: String(doc._id),
    siteId: String(doc.siteId),
    name: doc.name,
    keyHint: doc.keyHint,
    scopes,
    actingUserId: doc.actingUserId ? String(doc.actingUserId) : null,
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
  _id?: unknown;
  siteId: unknown;
  logoAssetId?: unknown;
  faviconAssetId?: unknown;
  siteTitle?: string | null;
  menuEntries?: unknown;
  mcpEnabled?: boolean | null;
  publishEnabled?: boolean | null;
  publishGithubOwner?: string | null;
  publishGithubRepo?: string | null;
  publishEventType?: string | null;
  publishGithubPatEnc?: string | null;
  publishReturnTokenHash?: string | null;
  publishLastTriggerAt?: Date | null;
  publishLastTriggerOk?: boolean | null;
  publishLastTriggerStatusCode?: number | null;
  publishLastTriggerMessage?: string | null;
  publishLastReturnAt?: Date | null;
  publishLastReturnStatus?: string | null;
  publishLastReturnRunUrl?: string | null;
  publishLastReturnPayload?: unknown;
  contentRevision?: number | null;
  lastPublishedWatermark?: unknown;
  backupEnabled?: boolean | null;
}) {
  let publishWebhookPostUrl: string | null = null;
  try {
    publishWebhookPostUrl = buildPublishWebhookPostUrl(String(doc.siteId));
  } catch {
    publishWebhookPostUrl = null;
  }
  const patEnc = typeof doc.publishGithubPatEnc === 'string' ? doc.publishGithubPatEnc.trim() : '';
  const retHash = typeof doc.publishReturnTokenHash === 'string' ? doc.publishReturnTokenHash.trim() : '';
  return {
    id: doc._id != null && doc._id !== undefined ? String(doc._id) : null,
    siteId: String(doc.siteId),
    logoAssetId: doc.logoAssetId ? String(doc.logoAssetId) : null,
    faviconAssetId: doc.faviconAssetId ? String(doc.faviconAssetId) : null,
    siteTitle: typeof doc.siteTitle === 'string' && doc.siteTitle.trim() ? doc.siteTitle.trim() : null,
    menuEntries: menuEntriesToObject(doc.menuEntries),
    mcpEnabled: doc.mcpEnabled !== false,
    publishEnabled: Boolean(doc.publishEnabled),
    publishGithubOwner:
      typeof doc.publishGithubOwner === 'string' && doc.publishGithubOwner.trim() ? doc.publishGithubOwner.trim() : null,
    publishGithubRepo:
      typeof doc.publishGithubRepo === 'string' && doc.publishGithubRepo.trim() ? doc.publishGithubRepo.trim() : null,
    publishGithubRepoUrl: (() => {
      const o = typeof doc.publishGithubOwner === 'string' ? doc.publishGithubOwner.trim() : '';
      const r = typeof doc.publishGithubRepo === 'string' ? doc.publishGithubRepo.trim() : '';
      return o && r ? `https://github.com/${o}/${r}` : null;
    })(),
    publishEventType:
      typeof doc.publishEventType === 'string' && doc.publishEventType.trim() ? doc.publishEventType.trim() : null,
    hasPublishPat: Boolean(patEnc),
    publishWebhookPostUrl,
    hasPublishReturnToken: Boolean(retHash),
    publishLastTriggerAt: doc.publishLastTriggerAt ? new Date(doc.publishLastTriggerAt).toISOString() : null,
    publishLastTriggerOk: typeof doc.publishLastTriggerOk === 'boolean' ? doc.publishLastTriggerOk : null,
    publishLastTriggerStatusCode:
      typeof doc.publishLastTriggerStatusCode === 'number' ? doc.publishLastTriggerStatusCode : null,
    publishLastTriggerMessage:
      typeof doc.publishLastTriggerMessage === 'string' && doc.publishLastTriggerMessage.trim()
        ? doc.publishLastTriggerMessage.trim()
        : null,
    publishLastReturnAt: doc.publishLastReturnAt ? new Date(doc.publishLastReturnAt).toISOString() : null,
    publishLastReturnStatus:
      typeof doc.publishLastReturnStatus === 'string' && doc.publishLastReturnStatus.trim()
        ? doc.publishLastReturnStatus.trim()
        : null,
    publishLastReturnRunUrl:
      typeof doc.publishLastReturnRunUrl === 'string' && doc.publishLastReturnRunUrl.trim()
        ? doc.publishLastReturnRunUrl.trim()
        : null,
    publishLastReturnPayload:
      doc.publishLastReturnPayload && typeof doc.publishLastReturnPayload === 'object'
        ? doc.publishLastReturnPayload
        : null,
    contentRevision:
      typeof doc.contentRevision === 'number' && Number.isFinite(doc.contentRevision)
        ? Math.floor(doc.contentRevision)
        : 0,
    lastPublishedWatermark:
      doc.lastPublishedWatermark != null && typeof doc.lastPublishedWatermark === 'object'
        ? doc.lastPublishedWatermark
        : null,
    backupEnabled: doc.backupEnabled !== false,
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
    menusResolved: async (parent: { siteId: string; menuEntries: unknown }, _args: unknown, ctx: RequestContext) => {
      const obj = menuEntriesToObject(parent.menuEntries);
      const slots = Object.keys(obj).sort();
      return Promise.all(
        slots.map(async (slot) => {
          const entryId = obj[slot];
          if (!entryId) return { slot, entry: null };
          const doc = await EntryModel.findOne({ _id: entryId, siteId: parent.siteId, deletedAt: null }).lean();
          if (!doc) return { slot, entry: null };
          const enriched = await withResolvedLatestEntryFields(String(parent.siteId), doc as Record<string, unknown>);
          return { slot, entry: await entryDocumentToGql(enriched, ctx) };
        }),
      );
    },
  },
  ContentType: {
    options: (parent: any) => parent.options ?? {},
  },
  Entry: {
    canonicalPath: async (
      parent: {
        id: string;
        siteId: string;
        contentTypeId: string;
        slug: string | null;
        publishedAt?: string | null;
        createdAt?: string;
      },
      _: unknown,
      _ctx: RequestContext,
    ) => {
      const ct = await ContentTypeModel.findOne({ _id: parent.contentTypeId, siteId: parent.siteId }).lean();
      if (!ct) return null;
      return buildCanonicalPath({
        contentType: { slug: ct.slug, options: (ct.options ?? null) as Record<string, unknown> | null },
        entry: {
          id: parent.id,
          slug: parent.slug,
          publishedAt: parent.publishedAt ?? null,
          createdAt: parent.createdAt ?? null,
        },
      });
    },
  },
  User: {
    displayName: (parent: { displayName?: string | null }) =>
      typeof parent.displayName === 'string' && parent.displayName.trim() ? parent.displayName.trim() : null,
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
    apiKeyInfo: async (_: unknown, __: unknown, ctx: RequestContext) => {
      if (!ctx.apiKey) throw new Error('Unauthorized');
      const doc = await ApiKeyModel.findById(ctx.apiKey.id).lean();
      return {
        siteId: ctx.apiKey.siteId,
        scopes: ctx.apiKey.scopes,
        name: typeof doc?.name === 'string' ? doc.name : '',
        keyHint: typeof doc?.keyHint === 'string' ? doc.keyHint : '',
      };
    },
    globalUsers: async (
      _: unknown,
      { role, siteId, status, isAdmin }: { role?: string; siteId?: string; status?: string; isAdmin?: boolean },
      ctx: RequestContext,
    ) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const actor = await UserModel.findById(ctx.userId).select({ isAdmin: 1 }).lean();

      const membershipFilter: Record<string, unknown> = {};
      if (actor?.isAdmin) {
        if (role) membershipFilter.role = role;
        if (siteId) membershipFilter.siteId = siteId;
      } else {
        const ownerMemberships = await MembershipModel.find({ userId: ctx.userId, role: 'owner' }).lean();
        const allowedSiteIds = ownerMemberships.map((membership) => String(membership.siteId));
        if (!allowedSiteIds.length) return [];
        if (siteId) {
          if (!allowedSiteIds.includes(String(siteId))) return [];
          membershipFilter.siteId = siteId;
        } else {
          membershipFilter.siteId = { $in: allowedSiteIds };
        }
        if (role) membershipFilter.role = role;
      }

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
    contentTypes: async (_: unknown, { siteId }: { siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'content_types:read');
      return (await ContentTypeModel.find({ siteId: sid }).lean()).map(toId);
    },
    workspaceOverview: async (_: unknown, { siteId }: { siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid);

      const siteOid = new mongoose.Types.ObjectId(sid);
      const [
        contentTypeCount,
        entryCount,
        assetCount,
        memberCount,
        latestEntry,
        settings,
        types,
        agg,
      ] = await Promise.all([
        ContentTypeModel.countDocuments({ siteId: sid }),
        EntryModel.countDocuments({ siteId: sid, deletedAt: null }),
        AssetModel.countDocuments({ siteId: sid }),
        MembershipModel.countDocuments({ siteId: sid }),
        EntryModel.findOne({ siteId: sid }).sort({ updatedAt: -1 }).select({ updatedAt: 1 }).lean(),
        SiteSettingsModel.findOne({ siteId: sid }).select({ siteTitle: 1 }).lean(),
        ContentTypeModel.find({ siteId: sid }).select({ _id: 1, name: 1, slug: 1 }).sort({ name: 1 }).lean(),
        EntryModel.aggregate<{ _id: mongoose.Types.ObjectId; entryCount: number }>([
          { $match: { siteId: siteOid, deletedAt: null } },
          { $group: { _id: '$contentTypeId', entryCount: { $sum: 1 } } },
        ]),
      ]);

      const countByCt = new Map(agg.map((row) => [String(row._id), row.entryCount]));
      const byContentType = types
        .map((t) => ({
          contentTypeId: String(t._id),
          name: typeof t.name === 'string' ? t.name : '',
          slug: typeof t.slug === 'string' ? t.slug : '',
          entryCount: countByCt.get(String(t._id)) ?? 0,
        }))
        .sort((a, b) => b.entryCount - a.entryCount || a.name.localeCompare(b.name));

      return {
        contentTypeCount,
        entryCount,
        assetCount,
        memberCount,
        siteTitle: settings?.siteTitle && String(settings.siteTitle).trim() ? String(settings.siteTitle).trim() : null,
        lastEntryActivity: latestEntry?.updatedAt
          ? new Date(latestEntry.updatedAt as Date).toISOString()
          : null,
        byContentType,
      };
    },
    entries: async (
      _: unknown,
      {
        siteId,
        contentTypeId,
        limit,
        offset,
        includeDrafts,
        includeDeleted,
        updatedSince,
      }: {
        siteId?: string | null;
        contentTypeId: string;
        limit?: number | null;
        offset?: number | null;
        includeDrafts?: boolean | null;
        includeDeleted?: boolean | null;
        updatedSince?: string | null;
      },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'entries:read');
      const nAct = await activateScheduledEntries(sid);
      if (nAct > 0) await bumpSiteContentRevision(sid);
      const { limit: l, offset: o } = clampListArgs(limit, offset, { limit: 30, offset: 0 });
      const filter: Record<string, unknown> = { siteId: sid, contentTypeId };
      if (includeDeleted !== true) filter.deletedAt = null;
      if (ctx.apiKey && !apiKeyHasScope(ctx.apiKey.scopes, 'entries:draft:read')) {
        filter.lifecycleStatus = 'published';
      } else if (includeDrafts === false) {
        filter.lifecycleStatus = 'published';
      }
      if (typeof updatedSince === 'string' && updatedSince.trim()) {
        const d = new Date(updatedSince.trim());
        if (!Number.isNaN(d.getTime())) filter.updatedAt = { $gt: d };
      }
      const entries = await EntryModel.find(filter).sort({ updatedAt: -1 }).skip(o).limit(l).lean();
      return Promise.all(
        entries.map(async (entry) => {
          const enriched = await withResolvedLatestEntryFields(sid, entry as Record<string, unknown>);
          return entryDocumentToGql(enriched, ctx);
        }),
      );
    },
    entry: async (_: unknown, { id, siteId }: { id: string; siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'entries:read');
      const nAct = await activateScheduledEntries(sid);
      if (nAct > 0) await bumpSiteContentRevision(sid);
      const deletedFilter = ctx.apiKey ? { deletedAt: null } : {};
      const doc = await EntryModel.findOne({ _id: id, siteId: sid, ...deletedFilter }).lean();
      if (!doc) return null;
      if (ctx.apiKey && !apiKeyHasScope(ctx.apiKey.scopes, 'entries:draft:read')) {
        if (doc.lifecycleStatus !== 'published') return null;
      }
      if (ctx.apiKey && doc.deletedAt) return null;
      const enriched = await withResolvedLatestEntryFields(sid, doc as Record<string, unknown>);
      return entryDocumentToGql(enriched, ctx);
    },
    entryBySlug: async (
      _: unknown,
      { siteId, contentTypeSlug, slug }: { siteId?: string | null; contentTypeSlug: string; slug: string },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'entries:read');
      const nAct = await activateScheduledEntries(sid);
      if (nAct > 0) await bumpSiteContentRevision(sid);
      const ct = await ContentTypeModel.findOne({ siteId: sid, slug: contentTypeSlug }).lean();
      if (!ct) return null;
      const usePublishedSlug = ctx.apiKey && !apiKeyHasScope(ctx.apiKey.scopes, 'entries:draft:read');
      const doc = await EntryModel.findOne(
        usePublishedSlug
          ? {
              siteId: sid,
              contentTypeId: ct._id,
              publishedSlug: slug,
              lifecycleStatus: 'published',
              deletedAt: null,
            }
          : { siteId: sid, contentTypeId: ct._id, slug, deletedAt: null },
      ).lean();
      if (!doc) return null;
      const enriched = await withResolvedLatestEntryFields(sid, doc as Record<string, unknown>);
      return entryDocumentToGql(enriched, ctx);
    },
    buildRouteManifest: async (_: unknown, { siteId }: { siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'entries:read');
      const types = await ContentTypeModel.find({ siteId: sid }).lean();
      const rows = await EntryModel.find({ siteId: sid }).lean();
      const ctList: RouteManifestContentType[] = types.map((t) => ({
        id: String(t._id),
        slug: String(t.slug ?? ''),
        options: (t.options ?? null) as Record<string, unknown> | null,
      }));
      const entryList: RouteManifestEntry[] = [];
      for (const row of rows) {
        const doc = row as Record<string, unknown>;
        if (!entryMatchesPublishedConsumerFilter(doc)) continue;
        const ps = doc.publishedSlug;
        const publishedSlug = typeof ps === 'string' && ps.trim() ? ps.trim() : null;
        if (!publishedSlug) continue;
        entryList.push({
          id: String(row._id),
          contentTypeId: String(row.contentTypeId),
          lifecycleStatus: typeof doc.lifecycleStatus === 'string' ? doc.lifecycleStatus : '',
          deletedAt: doc.deletedAt ? new Date(doc.deletedAt as Date).toISOString() : null,
          scheduledPublishAt: doc.scheduledPublishAt ? new Date(doc.scheduledPublishAt as Date).toISOString() : null,
          slug: publishedSlug,
          publishedSlug,
          publishedAt: doc.publishedAt ? new Date(doc.publishedAt as Date).toISOString() : null,
          createdAt: doc.createdAt ? new Date(doc.createdAt as Date).toISOString() : null,
        });
      }
      return buildRouteManifestNodes(ctList, entryList);
    },
    suggestSlug: async (
      _: unknown,
      {
        siteId,
        contentTypeId,
        base,
        excludeEntryId,
      }: { siteId?: string | null; contentTypeId: string; base: string; excludeEntryId?: string | null },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'entries:read');
      const ct = await ContentTypeModel.findOne({ _id: contentTypeId, siteId: sid }).lean();
      if (!ct) throw new Error('Content type not found');
      if (!Boolean((ct.options as Record<string, unknown> | undefined)?.hasSlug)) {
        badUserInput('This content type does not use entry slugs', ['contentTypeId']);
      }
      const root = slugify(String(base ?? '')) || 'entry';
      let candidate = root;
      let n = 2;
      while (true) {
        const filter: Record<string, unknown> = {
          siteId: sid,
          contentTypeId,
          deletedAt: null,
          slug: candidate,
        };
        if (excludeEntryId) filter._id = { $ne: excludeEntryId };
        const clash = await EntryModel.findOne(filter).select({ _id: 1 }).lean();
        if (!clash) return candidate;
        candidate = `${root}-${n}`;
        n += 1;
      }
    },
    entryRevisions: async (
      _: unknown,
      { entryId, siteId, limit, offset }: { entryId: string; siteId?: string | null; limit?: number | null; offset?: number | null },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const own = await EntryModel.findOne({ _id: entryId, siteId: sid }).lean();
      if (!own) throw new Error('Entry not found');
      const { limit: l, offset: o } = clampListArgs(limit, offset, { limit: 50, offset: 0 });
      const rows = await listEntryRevisions(entryId, sid, l, o);
      return rows.map((r) => ({
        id: r.id,
        entryId: r.entryId,
        siteId: r.siteId,
        revisionNumber: r.revisionNumber,
        kind: r.kind,
        createdAt: r.createdAt,
        createdById: r.createdById,
        payload: r.payload,
      }));
    },
    entryRevision: async (_: unknown, { id, siteId }: { id: string; siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const r = await getEntryRevision(id, sid);
      if (!r) return null;
      return {
        id: r.id,
        entryId: r.entryId,
        siteId: r.siteId,
        revisionNumber: r.revisionNumber,
        kind: r.kind,
        createdAt: r.createdAt,
        createdById: r.createdById,
        payload: r.payload,
      };
    },
    listAssets: async (_: unknown, { siteId, query = '', limit, offset }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'assets:read');
      const { limit: l, offset: o } = clampListArgs(limit, offset, { limit: 30, offset: 0 });

      const filter: Record<string, unknown> = { siteId: sid };
      const q = typeof query === 'string' ? query.trim() : '';
      if (q) filter.filename = { $regex: escapeRegexLiteral(q), $options: 'i' };

      const assets = await AssetModel.find(filter).sort({ createdAt: -1 }).skip(o).limit(l).lean();
      return Promise.all(assets.map(toAsset));
    },
    apiKeys: async (_: unknown, { siteId }: { siteId: string }, ctx: RequestContext) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'owner');
      const keys = await ApiKeyModel.find({ siteId, revokedAt: null }).sort({ createdAt: -1 }).lean();
      return keys.map(formatApiKeyDoc);
    },
    ...bundleQueryResolvers,
    ...backupQueryResolvers,
    siteSettings: async (_: unknown, { siteId }: { siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await requireReadSite(ctx, sid, 'site_settings:read');
      const doc = await SiteSettingsModel.findOne({ siteId: sid }).lean();
      if (!doc) {
        return siteSettingsDocToGql({
          siteId: sid,
          logoAssetId: null,
          faviconAssetId: null,
          siteTitle: null,
          menuEntries: {},
          mcpEnabled: true,
          contentRevision: 0,
          lastPublishedWatermark: null,
          backupEnabled: true,
        });
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
      if (user.status !== 'active') throw new Error('Invalid credentials');
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
    updateMyProfile: async (_: unknown, { displayName }: { displayName: string }, ctx: RequestContext) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      const t = String(displayName ?? '').trim();
      const update =
        !t
          ? { $unset: { displayName: '' as const } }
          : t.length > USER_DISPLAY_NAME_MAX
            ? null
            : { $set: { displayName: t } };
      if (update === null) {
        throw new Error(`That name is too long—${USER_DISPLAY_NAME_MAX} characters max.`);
      }
      const user = await UserModel.findByIdAndUpdate(ctx.userId, update, { new: true }).lean();
      if (!user) throw new Error('User not found');
      return toId(user);
    },
    changeMyPassword: async (
      _: unknown,
      { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
      ctx: RequestContext,
    ) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      const user = await UserModel.findById(ctx.userId).select({ passwordHash: 1 }).lean();
      if (!user?.passwordHash) {
        throw new Error('Set a password from the sign-in screen first, then you can change it here.');
      }
      if (!(await comparePassword(currentPassword, user.passwordHash))) {
        throw new Error("That isn't your current password.");
      }
      assertStrongPassword(newPassword);
      if (currentPassword === newPassword) {
        throw new Error("Pick a new password that's different from the old one.");
      }
      await UserModel.findByIdAndUpdate(ctx.userId, { passwordHash: await hashPassword(newPassword) });
      return true;
    },
    createSite: async (_: unknown, { name, url }: { name: string; url: string }, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const creator = await UserModel.findById(ctx.userId).lean();
      if (!creator?.isAdmin) throw new Error('Only platform administrators can create new sites');
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
      await requireRole(ctx.userId, siteId, 'owner');

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
      const actor = await UserModel.findById(ctx.userId).lean();
      if (!actor?.isAdmin) throw new Error('Only platform administrators can create accounts');
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
    createSiteUser: async (
      _: unknown,
      { siteId, email, password, role }: { siteId: string; email: string; password: string; role: string },
      ctx: RequestContext,
    ) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      if (!roles.includes(role as Role)) throw new Error('Invalid role');

      const isGlobal = await actorIsGlobalAdmin(ctx);
      if (!isGlobal) {
        await requireRole(ctx.userId, siteId, 'owner');
        if (!SITE_OWNER_ASSIGNABLE_ROLES.includes(role as Role)) {
          throw new Error('Site owners can only add people as viewer or editor (or ask a platform administrator for owner access)');
        }
      }

      assertStrongPassword(password);
      const normalizedEmail = email.toLowerCase();
      const existing = await UserModel.findOne({ email: normalizedEmail });
      if (existing) throw new Error('Email already in use');

      const user = await UserModel.create({
        email: normalizedEmail,
        passwordHash: await hashPassword(password),
        status: 'active',
        isAdmin: false,
      });

      await MembershipModel.create({ userId: user._id, siteId, role });

      return toGlobalUser(String(user._id));
    },
    updateUserStatus: async (_: unknown, { userId, status }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      if (!['active', 'disabled'].includes(status)) throw new Error('Invalid status');
      const actor = await UserModel.findById(ctx.userId).lean();
      if (!actor?.isAdmin) throw new Error('Only platform administrators can change account status');

      const user = await UserModel.findByIdAndUpdate(userId, { status }, { new: true });
      if (!user) throw new Error('User not found');

      return toGlobalUser(String(user._id));
    },
    setUserAdmin: async (_: unknown, { userId, isAdmin }: { userId: string; isAdmin: boolean }, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      const currentUser = await UserModel.findById(ctx.userId).lean();
      if (!currentUser?.isAdmin) throw new Error('Only platform administrators can change platform admin access');
      const user = await UserModel.findByIdAndUpdate(userId, { isAdmin }, { new: true });
      if (!user) throw new Error('User not found');
      return toGlobalUser(String(user._id));
    },
    setUserSiteRole: async (_: unknown, { userId, siteId, role }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'owner');
      if (!roles.includes(role)) throw new Error('Invalid role');

      const user = await UserModel.findById(userId).lean();
      if (!user) throw new Error('User not found');

      const existing = await MembershipModel.findOne({ userId, siteId }).lean();
      const isGlobal = await actorIsGlobalAdmin(ctx);
      const promotesToOwner = role === 'owner' && existing?.role !== 'owner';
      const demotesOwner = existing?.role === 'owner' && role !== 'owner';
      if ((promotesToOwner || demotesOwner) && !isGlobal) {
        throw new Error('Only platform administrators can assign or change the site owner role');
      }

      await MembershipModel.findOneAndUpdate({ userId, siteId }, { role }, { upsert: true, new: true });

      return toGlobalUser(String(userId));
    },
    removeUserSiteAccess: async (_: unknown, { userId, siteId }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'owner');
      const victim = await MembershipModel.findOne({ userId, siteId }).lean();
      if (victim?.role === 'owner') {
        const isGlobal = await actorIsGlobalAdmin(ctx);
        if (!isGlobal) throw new Error('Only platform administrators can remove a site owner');
      }
      await MembershipModel.deleteOne({ userId, siteId });
      return toGlobalUser(String(userId));
    },
    inviteUser: async (_: unknown, { siteId, email, role }: any, ctx: RequestContext) => {
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'owner');
      if (!roles.includes(role)) throw new Error('Invalid role');
      const isGlobal = await actorIsGlobalAdmin(ctx);
      if (role === 'owner' && !isGlobal) {
        throw new Error('Only platform administrators can invite with the site owner role');
      }
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
      await requireRole(ctx.userId, siteId, 'owner');
      if (!roles.includes(role)) throw new Error('Invalid role');
      const existing = await MembershipModel.findOne({ userId, siteId }).lean();
      if (!existing) throw new Error('Membership not found');
      const isGlobal = await actorIsGlobalAdmin(ctx);
      const promotesToOwner = role === 'owner' && existing.role !== 'owner';
      const demotesOwner = existing.role === 'owner' && role !== 'owner';
      if ((promotesToOwner || demotesOwner) && !isGlobal) {
        throw new Error('Only platform administrators can assign or change the site owner role');
      }
      const membership = await MembershipModel.findOneAndUpdate({ userId, siteId }, { role }, { new: true });
      if (!membership) throw new Error('Membership not found');
      return toId(membership.toObject());
    },
    createContentType: async (_: unknown, { siteId, name, slug, fields, options = {} }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'content_types:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'owner');
      const safeFields = validateFieldDefinitions(fields);
      await assertReferencedContentTypesExist(sid, safeFields as FieldDef[]);
      const normalizedSlug = slugify(String(slug ?? ''));
      if (!normalizedSlug) throw new Error('Content type URL key could not be derived from the name');
      let normalizedOptions: Record<string, unknown> = {};
      try {
        normalizedOptions = normalizeContentTypeRoutingOptions(
          (options && typeof options === 'object' && !Array.isArray(options) ? (options as Record<string, unknown>) : {}) as Record<string, unknown>,
          Boolean((options as Record<string, unknown> | undefined)?.hasSlug),
          normalizedSlug,
        ) as Record<string, unknown>;
      } catch (e) {
        badUserInput(e instanceof Error ? e.message : 'Invalid content type options', ['options']);
      }
      try {
        normalizedOptions = normalizeMetaTaxonomyOptions(normalizedSlug, normalizedOptions);
      } catch (e) {
        badUserInput(e instanceof Error ? e.message : 'Invalid content type options', ['options']);
      }
      try {
        const ct = await ContentTypeModel.create({
          siteId: sid,
          name,
          slug: normalizedSlug,
          fields: safeFields,
          options: normalizedOptions,
        });
        await bumpSiteContentRevision(sid);
        return toId(ct.toObject());
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && (error as { code: number }).code === 11000) {
          throw new Error('A content type with this URL key already exists in this workspace.');
        }
        throw error;
      }
    },
    updateContentType: async (_: unknown, { id, siteId, ...rest }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'content_types:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'owner');
      if (rest.fields) {
        rest.fields = validateFieldDefinitions(rest.fields);
        await assertReferencedContentTypesExist(sid, rest.fields as FieldDef[], id);
      }
      if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
        if (rest.slug == null || rest.slug === '') {
          delete rest.slug;
        } else {
          rest.slug = slugify(String(rest.slug));
        }
      }
      if (rest.options !== undefined) {
        const existing = await ContentTypeModel.findOne({ _id: id, siteId: sid }).lean();
        if (!existing) throw new Error('Content type not found');
        const merged = {
          ...((existing.options && typeof existing.options === 'object' && !Array.isArray(existing.options)
            ? (existing.options as Record<string, unknown>)
            : {}) as Record<string, unknown>),
          ...(rest.options && typeof rest.options === 'object' && !Array.isArray(rest.options)
            ? (rest.options as Record<string, unknown>)
            : {}),
        };
        const slugKey = typeof rest.slug === 'string' && rest.slug ? rest.slug : String(existing.slug ?? '');
        try {
          rest.options = normalizeContentTypeRoutingOptions(merged, Boolean(merged.hasSlug), slugKey) as Record<
            string,
            unknown
          >;
        } catch (e) {
          badUserInput(e instanceof Error ? e.message : 'Invalid content type options', ['options']);
        }
        try {
          rest.options = normalizeMetaTaxonomyOptions(slugKey, rest.options as Record<string, unknown>) as Record<
            string,
            unknown
          >;
        } catch (e) {
          badUserInput(e instanceof Error ? e.message : 'Invalid content type options', ['options']);
        }
      }
      try {
        const ct = await ContentTypeModel.findOneAndUpdate({ _id: id, siteId: sid }, rest, { new: true });
        if (!ct) throw new Error('Content type not found');
        await bumpSiteContentRevision(sid);
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
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'content_types:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'owner');
      await ContentTypeModel.deleteOne({ _id: id, siteId: sid });
      await bumpSiteContentRevision(sid);
      return true;
    },
    createEntry: async (_: unknown, { siteId, contentTypeId, name, slug, data, meta: metaInput }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const contentType = await ContentTypeModel.findOne({ _id: contentTypeId, siteId: sid }).lean();
      if (!contentType) throw new Error('Content type not found');
      assertMetaNotDisabledForMutation(contentType, metaInput);
      const entryMeta = normalizeEntryMetaInput(metaInput, { enabled: isMetaTaxonomyEnabled(contentType) });
      const displayName = normalizeEntryName(name);
      await assertEntryNameUnique(sid, contentTypeId, displayName);
      const hydratedFields = await hydrateRepeaterFields(sid, contentType.fields as FieldDef[]);
      try {
        validateEntryData(hydratedFields as any, data as Record<string, unknown>);
      } catch (e) {
        rethrowEntryValidation(e);
      }
      await assertAssetsBelongToSite(sid, collectImageAssetIds(hydratedFields as FieldDef[], data as Record<string, unknown>));
      await assertReferencedEntriesBelongToSite(sid, hydratedFields as FieldDef[], data as Record<string, unknown>);
      const resolvedSlug = resolveEntrySlug(contentType as any, data as Record<string, unknown>, slug, displayName);
      const entry = await EntryModel.create({
        siteId: sid,
        contentTypeId,
        name: displayName,
        slug: resolvedSlug,
        data,
        meta: entryMeta,
        publishedMeta: { title: null, description: null },
        updatedBy: ctx.userId,
        lifecycleStatus: 'draft',
        publishedAt: null,
        publishedName: null,
        publishedSlug: null,
        publishedData: null,
        hasUnpublishedChanges: false,
        scheduledPublishAt: null,
        scheduledUnpublishAt: null,
        deletedAt: null,
        deletedBy: null,
        lastPublishedRevisionId: null,
      });
      await appendEntryRevision({
        entryId: String(entry._id),
        siteId: sid,
        userId: ctx.userId,
        kind: 'draft_save',
        payload: {
          name: displayName,
          slug: resolvedSlug,
          data: data as Record<string, unknown>,
          meta: entryMeta,
        },
      });
      const raw = (await EntryModel.findById(entry._id).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      await bumpSiteContentRevision(sid);
      return entryDocumentToGql(enriched, ctx);
    },
    updateEntry: async (_: unknown, { id, siteId, ...rest }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const current = await EntryModel.findOne({ _id: id, siteId: sid }).lean();
      if (!current) throw new Error('Entry not found');
      if (Object.prototype.hasOwnProperty.call(rest, 'name')) {
        const displayName = normalizeEntryName(rest.name);
        await assertEntryNameUnique(sid, current.contentTypeId, displayName, id);
        rest.name = displayName;
      }
      const nameForSlugResolution =
        typeof rest.name === 'string' ? rest.name : typeof current.name === 'string' ? current.name : null;

      if (rest.data) {
        const ct = await ContentTypeModel.findOne({ _id: current.contentTypeId, siteId: sid }).lean();
        if (!ct) throw new Error('Content type not found');
        const hydratedFields = await hydrateRepeaterFields(sid, ct.fields as FieldDef[]);
        try {
          validateEntryData(hydratedFields as any, rest.data as Record<string, unknown>);
        } catch (e) {
          rethrowEntryValidation(e);
        }
        await assertAssetsBelongToSite(sid, collectImageAssetIds(hydratedFields as FieldDef[], rest.data as Record<string, unknown>));
        await assertReferencedEntriesBelongToSite(sid, hydratedFields as FieldDef[], rest.data as Record<string, unknown>);
        if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
          rest.slug = resolveEntrySlug(ct as any, rest.data as Record<string, unknown>, rest.slug, nameForSlugResolution);
        }
      } else if (Object.prototype.hasOwnProperty.call(rest, 'slug')) {
        const ct = await ContentTypeModel.findOne({ _id: current.contentTypeId, siteId: sid }).lean();
        if (!ct) throw new Error('Content type not found');
        rest.slug = resolveEntrySlug(ct as any, (current.data ?? {}) as Record<string, unknown>, rest.slug, nameForSlugResolution);
      }
      if (Object.prototype.hasOwnProperty.call(rest, 'meta')) {
        const ct = await ContentTypeModel.findOne({ _id: current.contentTypeId, siteId: sid }).lean();
        if (!ct) throw new Error('Content type not found');
        assertMetaNotDisabledForMutation(ct, rest.meta);
        rest.meta = normalizeEntryMetaInput(rest.meta, { enabled: isMetaTaxonomyEnabled(ct) });
      }
      const entry = await EntryModel.findOneAndUpdate({ _id: id, siteId: sid }, { ...rest, updatedBy: ctx.userId }, { new: true }).lean();
      if (!entry) throw new Error('Entry not found');
      const hu =
        entry.lifecycleStatus === 'published' &&
        (entry.name !== entry.publishedName ||
          String(entry.slug ?? '') !== String(entry.publishedSlug ?? '') ||
          JSON.stringify(entry.data ?? {}) !== JSON.stringify(entry.publishedData ?? {}) ||
          entryMetaDiffersFromPublished(entry as Record<string, unknown>));
      await EntryModel.updateOne({ _id: id, siteId: sid }, { $set: { hasUnpublishedChanges: hu } });
      const saved = await EntryModel.findById(id).lean();
      if (saved) {
        const lastRev = await EntryRevisionModel.findOne({ entryId: new mongoose.Types.ObjectId(id) })
          .sort({ revisionNumber: -1 })
          .select({ _id: 1 })
          .lean();
        const name = typeof saved.name === 'string' ? saved.name : '';
        const slug = typeof saved.slug === 'string' ? saved.slug : null;
        const data =
          saved.data && typeof saved.data === 'object' && !Array.isArray(saved.data)
            ? (saved.data as Record<string, unknown>)
            : {};
        const meta = metaToStored(metaPayloadFromDoc(saved as Record<string, unknown>));
        await appendEntryRevision({
          entryId: String(id),
          siteId: sid,
          userId: ctx.userId,
          kind: 'draft_save',
          payload: { name, slug, data, meta },
          previousRevisionId: lastRev?._id ? String(lastRev._id) : null,
        });
      }
      const raw = (await EntryModel.findById(id).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      await bumpSiteContentRevision(sid);
      return entryDocumentToGql(enriched, ctx);
    },
    deleteEntry: async (_: unknown, { id, siteId }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      if (await entryReferencedBySiteSettings(sid, String(id))) {
        throw new Error('Entry is assigned to a menu slot in site settings. Unassign it first.');
      }
      await EntryModel.updateOne(
        { _id: id, siteId: sid },
        { $set: { deletedAt: new Date(), deletedBy: new mongoose.Types.ObjectId(ctx.userId) } },
      );
      await bumpSiteContentRevision(sid);
      void fireContentWebhook('entry.deleted', { siteId: sid, entryId: String(id) });
      return true;
    },
    uploadAsset: async (
      _: unknown,
      { siteId, fileBase64, filename, mimeType, alt = '', title = '', focalX, focalY }: any,
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'assets:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const id = await persistImageUpload({
        siteId: sid,
        userId: ctx.userId,
        fileBase64,
        filename,
        mimeType,
        alt,
        title,
        focalX: focalX ?? undefined,
        focalY: focalY ?? undefined,
      });
      const asset = await AssetModel.findById(id).lean();
      if (!asset) throw new Error('Asset not found');
      await bumpSiteContentRevision(sid);
      return toAsset(asset);
    },
    updateAssetMeta: async (_: unknown, { id, siteId, alt, title, focalX, focalY }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'assets:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const $set: Record<string, unknown> = {};
      if (alt !== undefined) $set.alt = alt ?? '';
      if (title !== undefined) $set.title = title ?? '';
      if (focalX !== undefined) $set.focalX = normalizeFocal01(Number(focalX));
      if (focalY !== undefined) $set.focalY = normalizeFocal01(Number(focalY));
      if (!Object.keys($set).length) throw new Error('No fields to update');
      const asset = await AssetModel.findOneAndUpdate({ _id: id, siteId: sid }, { $set }, { new: true }).lean();
      if (!asset) throw new Error('Asset not found');
      await bumpSiteContentRevision(sid);
      return toAsset(asset);
    },
    deleteAsset: async (_: unknown, { id, siteId }: any, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'assets:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');

      if (await assetReferencedBySiteSettings(sid, String(id))) {
        throw new Error('Asset is used as site logo or favicon. Remove it from site settings first.');
      }

      const entries = await EntryModel.find({ siteId: sid }).select({ data: 1 }).lean();
      const inUse = entries.some((entry) => entryContainsAsset(entry.data, String(id)));
      if (inUse) throw new Error('Asset is referenced by an entry');

      const asset = await AssetModel.findOneAndDelete({ _id: id, siteId: sid }).lean();
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
      await bumpSiteContentRevision(sid);
      return true;
    },
    createApiKey: async (
      _: unknown,
      { siteId, name, scopes, actingUserId }: { siteId: string; name: string; scopes: string[]; actingUserId?: string | null },
      ctx: RequestContext,
    ) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'owner');
      const normalizedScopes = normalizeAndValidateScopes(scopes);
      let acting: string | null = null;
      if (scopesRequireActingUser(normalizedScopes)) {
        if (!actingUserId) throw new Error('actingUserId is required when granting write scopes');
        await requireRole(actingUserId, siteId, 'editor');
        acting = String(actingUserId);
      }
      const secret = generateApiKeySecret();
      const doc = await ApiKeyModel.create({
        siteId,
        name: String(name ?? '').trim() || 'API key',
        secretHash: hashApiKeySecret(secret),
        keyHint: secret.slice(-6),
        createdBy: ctx.userId,
        scopes: normalizedScopes,
        actingUserId: acting,
      });
      const token = formatApiKeyToken(String(doc._id), secret);
      return { apiKey: formatApiKeyDoc(doc.toObject()), token };
    },
    revokeApiKey: async (_: unknown, { id, siteId }: { id: string; siteId: string }, ctx: RequestContext) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      await requireRole(ctx.userId, siteId, 'owner');
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
        siteId?: string | null;
        input: {
          logoAssetId?: string | null;
          faviconAssetId?: string | null;
          siteTitle?: string | null;
          menuEntries?: unknown;
          mcpEnabled?: boolean | null;
        };
      },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'site_settings:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      if (Object.prototype.hasOwnProperty.call(input, 'mcpEnabled')) {
        await requireRole(ctx.userId, sid, 'owner');
      }

      const existing = await SiteSettingsModel.findOne({ siteId: sid }).lean();

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

      const nextMcpEnabled = Object.prototype.hasOwnProperty.call(input, 'mcpEnabled')
        ? Boolean(input.mcpEnabled)
        : existing?.mcpEnabled !== false;

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
      await assertAssetsBelongToSite(sid, assetIds);
      await assertEntriesBelongToSite(sid, [...nextMenu.values()]);

      const siteTitleNormalized =
        nextTitle === null || nextTitle === undefined
          ? null
          : String(nextTitle).trim() || null;

      const updated = await SiteSettingsModel.findOneAndUpdate(
        { siteId: sid },
        {
          $set: {
            logoAssetId: logoId,
            faviconAssetId: favId,
            siteTitle: siteTitleNormalized,
            menuEntries: nextMenu,
            mcpEnabled: nextMcpEnabled,
          },
          $setOnInsert: { siteId: sid },
        },
        { upsert: true, new: true },
      ).lean();
      if (!updated) throw new Error('Failed to save site settings');
      await bumpSiteContentRevision(sid);
      return siteSettingsDocToGql(updated);
    },
    updatePublishWebhook: async (
      _: unknown,
      {
        siteId,
        input,
      }: {
        siteId?: string | null;
        input: {
          publishEnabled?: boolean | null;
          githubRepoUrl?: string | null;
          publishGithubOwner?: string | null;
          publishGithubRepo?: string | null;
          publishEventType?: string | null;
          githubPat?: string | null;
        };
      },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      await assertCanConfigurePublishWebhook(ctx, sid);

      const existing = await SiteSettingsModel.findOne({ siteId: sid }).lean();
      const $set: Record<string, unknown> = {};
      const $unset: Record<string, ''> = {};

      if (input.publishEnabled !== undefined && input.publishEnabled !== null) {
        $set.publishEnabled = Boolean(input.publishEnabled);
      }
      if (Object.prototype.hasOwnProperty.call(input, 'githubRepoUrl')) {
        const gru = input.githubRepoUrl;
        if (gru == null || (typeof gru === 'string' && gru.trim() === '')) {
          $set.publishGithubOwner = null;
          $set.publishGithubRepo = null;
        } else {
          const parsed = parseGithubRepoUrl(String(gru));
          $set.publishGithubOwner = parsed.owner;
          $set.publishGithubRepo = parsed.repo;
        }
      } else {
        if (input.publishGithubOwner !== undefined && input.publishGithubOwner !== null) {
          $set.publishGithubOwner = String(input.publishGithubOwner).trim() || null;
        }
        if (input.publishGithubRepo !== undefined && input.publishGithubRepo !== null) {
          $set.publishGithubRepo = String(input.publishGithubRepo).trim() || null;
        }
      }
      if (input.publishEventType !== undefined && input.publishEventType !== null) {
        $set.publishEventType = String(input.publishEventType).trim() || null;
      }

      if (Object.prototype.hasOwnProperty.call(input, 'githubPat')) {
        const raw = input.githubPat;
        if (raw === null || raw === undefined) {
          /* keep existing */
        } else if (String(raw).trim() === '') {
          $unset.publishGithubPatEnc = '';
        } else {
          try {
            $set.publishGithubPatEnc = encryptPublishPat(String(raw).trim());
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new Error(
              msg.includes('JWT_SECRET') || msg.includes('PUBLISH_WEBHOOK_ENCRYPTION_KEY')
                ? 'Server encryption keys are not configured; set JWT_SECRET (or optionally PUBLISH_WEBHOOK_ENCRYPTION_KEY) on the API.'
                : msg,
            );
          }
        }
      }

      const nextEnabled =
        $set.publishEnabled !== undefined ? Boolean($set.publishEnabled) : Boolean(existing?.publishEnabled);
      const nextOwner =
        $set.publishGithubOwner !== undefined
          ? ($set.publishGithubOwner as string | null)
          : typeof existing?.publishGithubOwner === 'string'
            ? existing.publishGithubOwner.trim()
            : '';
      const nextRepo =
        $set.publishGithubRepo !== undefined
          ? ($set.publishGithubRepo as string | null)
          : typeof existing?.publishGithubRepo === 'string'
            ? existing.publishGithubRepo.trim()
            : '';
      const nextEvent =
        $set.publishEventType !== undefined
          ? ($set.publishEventType as string | null)
          : typeof existing?.publishEventType === 'string'
            ? existing.publishEventType.trim()
            : '';
      let nextPatEnc =
        $set.publishGithubPatEnc !== undefined
          ? ($set.publishGithubPatEnc as string)
          : typeof existing?.publishGithubPatEnc === 'string'
            ? existing.publishGithubPatEnc.trim()
            : '';
      if ($unset.publishGithubPatEnc !== undefined) nextPatEnc = '';

      if (nextEnabled) {
        if (!nextOwner || !nextRepo || !nextEvent) {
          throw new Error(
            'When builds are enabled, add a repository link, workflow trigger name, and token—or turn builds off.',
          );
        }
        assertPublishGithubIds(nextOwner, nextRepo, nextEvent);
        if (!nextPatEnc) {
          throw new Error('When publish is enabled, a GitHub token is required (paste a new PAT or keep an existing one).');
        }
      }

      const update: Record<string, unknown> = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;
      if (!Object.keys(update).length) {
        const cur = await SiteSettingsModel.findOne({ siteId: sid }).lean();
        return siteSettingsDocToGql(cur ?? { siteId: sid, menuEntries: {}, mcpEnabled: true });
      }

      const updated = await SiteSettingsModel.findOneAndUpdate({ siteId: sid }, update, {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }).lean();
      if (!updated) throw new Error('Failed to save publish webhook settings');
      return siteSettingsDocToGql(updated);
    },
    triggerPublishWebhook: async (_: unknown, { siteId }: { siteId: string }, ctx: RequestContext) => {
      if (!ctx.userId || ctx.apiKey) throw new Error('Unauthorized');
      const sid = resolveSiteId(ctx, siteId);
      await requireRole(ctx.userId, sid, 'editor');
      const doc = await SiteSettingsModel.findOne({ siteId: sid }).lean();
      if (!doc) {
        return {
          ok: false,
          statusCode: 0,
          message: 'Workspace settings were not found.',
          triggeredAt: new Date().toISOString(),
        };
      }
      const triggeredAt = new Date().toISOString();
      const result = await triggerRepositoryDispatch({
        siteId: sid,
        triggeredByUserId: ctx.userId,
        settings: doc,
      });
      return {
        ok: result.ok,
        statusCode: result.statusCode,
        message: result.message,
        triggeredAt,
      };
    },
    rotatePublishReturnWebhook: async (_: unknown, { siteId }: { siteId: string }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await assertCanConfigurePublishWebhook(ctx, sid);
      const token = generateReturnWebhookToken();
      const hash = hashReturnWebhookToken(token);
      const callbackUrl = buildPublishCompletionCallbackUrl(sid, token);
      await SiteSettingsModel.findOneAndUpdate(
        { siteId: sid },
        { $set: { publishReturnTokenHash: hash }, $setOnInsert: { siteId: sid } },
        { upsert: true, new: true },
      );
      return { callbackUrl };
    },
    disablePublishReturnWebhook: async (_: unknown, { siteId }: { siteId: string }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      await assertCanConfigurePublishWebhook(ctx, sid);
      await SiteSettingsModel.findOneAndUpdate(
        { siteId: sid },
        {
          $unset: {
            publishReturnTokenHash: '',
            publishLastReturnAt: '',
            publishLastReturnStatus: '',
            publishLastReturnRunUrl: '',
            publishLastReturnPayload: '',
          },
        },
        { upsert: false },
      );
      const doc = await SiteSettingsModel.findOne({ siteId: sid }).lean();
      if (!doc) {
        return siteSettingsDocToGql({ siteId: sid, menuEntries: {}, mcpEnabled: true });
      }
      return siteSettingsDocToGql(doc);
    },
    publishEntry: async (_: unknown, { id, siteId }: { id: string; siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const cur = await EntryModel.findOne({ _id: id, siteId: sid, deletedAt: null }).lean();
      if (!cur) throw new Error('Entry not found');
      const slug = typeof cur.slug === 'string' ? cur.slug : null;
      if (slug) {
        const clash = await EntryModel.findOne({
          siteId: sid,
          contentTypeId: cur.contentTypeId,
          publishedSlug: slug,
          lifecycleStatus: 'published',
          deletedAt: null,
          _id: { $ne: cur._id },
        })
          .select({ _id: 1 })
          .lean();
        if (clash) badUserInput('Another published entry already uses this slug.', ['slug']);
      }
      const updated = await applyPublishToEntry(String(id), sid, ctx.userId);
      if (!updated) throw new Error('Entry not found');
      await bumpSiteContentRevision(sid);
      void fireContentWebhook('entry.published', { siteId: sid, entryId: String(id) });
      const enriched = await withResolvedLatestEntryFields(sid, updated);
      return entryDocumentToGql(enriched, ctx);
    },
    unpublishEntry: async (_: unknown, { id, siteId }: { id: string; siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const cur = await EntryModel.findOne({ _id: id, siteId: sid, deletedAt: null }).lean();
      if (!cur) throw new Error('Entry not found');
      if (cur.lifecycleStatus !== 'published') throw new Error('Entry is not published');
      const p = {
        name: typeof cur.publishedName === 'string' ? cur.publishedName : String(cur.name ?? ''),
        slug: typeof cur.publishedSlug === 'string' || cur.publishedSlug === null ? (cur.publishedSlug as string | null) : null,
        data:
          cur.publishedData && typeof cur.publishedData === 'object' && !Array.isArray(cur.publishedData)
            ? (cur.publishedData as Record<string, unknown>)
            : {},
        meta: metaToStored(publishedMetaPayloadFromDoc(cur as Record<string, unknown>)),
      };
      const { revisionId } = await appendEntryRevision({
        entryId: String(id),
        siteId: sid,
        userId: ctx.userId,
        kind: 'unpublish',
        payload: p,
        previousRevisionId: cur.lastPublishedRevisionId ? String(cur.lastPublishedRevisionId) : null,
      });
      await EntryModel.updateOne(
        { _id: id, siteId: sid },
        {
          $set: {
            lifecycleStatus: 'draft',
            publishedAt: null,
            publishedName: null,
            publishedSlug: null,
            publishedData: null,
            publishedMeta: { title: null, description: null },
            hasUnpublishedChanges: false,
            scheduledUnpublishAt: null,
            lastPublishedRevisionId: new mongoose.Types.ObjectId(revisionId),
          },
        },
      );
      await bumpSiteContentRevision(sid);
      void fireContentWebhook('entry.unpublished', { siteId: sid, entryId: String(id) });
      const raw = (await EntryModel.findById(id).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      return entryDocumentToGql(enriched, ctx);
    },
    restoreEntry: async (_: unknown, { id, siteId }: { id: string; siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      await EntryModel.updateOne({ _id: id, siteId: sid }, { $set: { deletedAt: null, deletedBy: null } });
      await bumpSiteContentRevision(sid);
      void fireContentWebhook('entry.restored', { siteId: sid, entryId: String(id) });
      const doc = await EntryModel.findOne({ _id: id, siteId: sid }).lean();
      if (!doc) throw new Error('Entry not found');
      const enriched = await withResolvedLatestEntryFields(sid, doc as Record<string, unknown>);
      return entryDocumentToGql(enriched, ctx);
    },
    rollbackEntryToRevision: async (
      _: unknown,
      { revisionId, siteId }: { revisionId: string; siteId?: string | null },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const rev = await EntryRevisionModel.findOne({ _id: revisionId, siteId: sid }).lean();
      if (!rev) throw new Error('Revision not found');
      const entryId = String(rev.entryId);
      const p = rev.payload as EntryRevisionPayload;
      const meta = p.meta ? metaToStored(p.meta) : emptyEntryMeta();
      const { revisionId: newRevId } = await appendEntryRevision({
        entryId,
        siteId: sid,
        userId: ctx.userId,
        kind: 'rollback',
        payload: { ...p, meta },
        previousRevisionId: String(rev._id),
      });
      const cur = await EntryModel.findOne({ _id: entryId, siteId: sid }).lean();
      const $set: Record<string, unknown> = {
        name: p.name,
        slug: p.slug,
        data: p.data,
        meta,
        updatedBy: ctx.userId,
      };
      if (cur?.lifecycleStatus === 'published') {
        $set.publishedName = p.name;
        $set.publishedSlug = p.slug;
        $set.publishedData = p.data;
        $set.publishedMeta = meta;
        $set.hasUnpublishedChanges = false;
        $set.lastPublishedRevisionId = new mongoose.Types.ObjectId(newRevId);
      }
      await EntryModel.updateOne({ _id: entryId, siteId: sid }, { $set });
      await bumpSiteContentRevision(sid);
      void fireContentWebhook('entry.rollback', { siteId: sid, entryId, revisionId: String(revisionId) });
      const raw = (await EntryModel.findById(entryId).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      return entryDocumentToGql(enriched, ctx);
    },
    schedulePublishEntry: async (
      _: unknown,
      { id, siteId, at }: { id: string; siteId?: string | null; at: string },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const when = new Date(String(at).trim());
      if (Number.isNaN(when.getTime())) throw new Error('Invalid schedule time');
      if (when.getTime() <= Date.now()) throw new Error('Schedule time must be in the future');
      await EntryModel.updateOne(
        { _id: id, siteId: sid, deletedAt: null },
        { $set: { scheduledPublishAt: when, scheduledUnpublishAt: null } },
      );
      const raw = (await EntryModel.findById(id).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      return entryDocumentToGql(enriched, ctx);
    },
    cancelScheduledPublish: async (_: unknown, { id, siteId }: { id: string; siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      await EntryModel.updateOne({ _id: id, siteId: sid, deletedAt: null }, { $set: { scheduledPublishAt: null } });
      const raw = (await EntryModel.findById(id).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      return entryDocumentToGql(enriched, ctx);
    },
    scheduleUnpublishEntry: async (
      _: unknown,
      { id, siteId, at }: { id: string; siteId?: string | null; at: string },
      ctx: RequestContext,
    ) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      const cur = await EntryModel.findOne({ _id: id, siteId: sid, deletedAt: null }).lean();
      if (!cur) throw new Error('Entry not found');
      if (cur.lifecycleStatus !== 'published') throw new Error('Only published entries can be scheduled for unpublish');
      const when = new Date(String(at).trim());
      if (Number.isNaN(when.getTime())) throw new Error('Invalid schedule time');
      if (when.getTime() <= Date.now()) throw new Error('Schedule time must be in the future');
      await EntryModel.updateOne(
        { _id: id, siteId: sid, deletedAt: null },
        { $set: { scheduledUnpublishAt: when, scheduledPublishAt: null } },
      );
      const raw = (await EntryModel.findById(id).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      return entryDocumentToGql(enriched, ctx);
    },
    cancelScheduledUnpublish: async (_: unknown, { id, siteId }: { id: string; siteId?: string | null }, ctx: RequestContext) => {
      const sid = resolveSiteId(ctx, siteId);
      if (ctx.apiKey) requireApiKeyScope(ctx, 'entries:write');
      if (!ctx.userId) throw new Error('Unauthorized');
      await requireRole(ctx.userId, sid, 'editor');
      await EntryModel.updateOne({ _id: id, siteId: sid, deletedAt: null }, { $set: { scheduledUnpublishAt: null } });
      const raw = (await EntryModel.findById(id).lean()) as Record<string, unknown>;
      const enriched = await withResolvedLatestEntryFields(sid, raw);
      return entryDocumentToGql(enriched, ctx);
    },
    ...bundleMutationResolvers,
    ...backupMutationResolvers,
  },
};
