import { getStorageAdapter } from '../assets/index.js';
import { persistImageUpload } from '../assets/persist-image-upload.js';
import { AssetModel } from '../db/models/Asset.js';
import { ContentTypeModel } from '../db/models/ContentType.js';
import { EntryModel } from '../db/models/Entry.js';
import { MENU_SLOT_KEY_PATTERN, MENU_SLOT_MAX_SLOTS, SiteSettingsModel } from '../db/models/SiteSettings.js';
import { assertReferencedEntriesBelongToSite } from '../domain/fields/entries-refs.js';
import {
  assertReferencedContentTypesExist,
  hydrateRepeaterFields,
  type FieldDef,
} from '../domain/fields/repeater-hydrate.js';
import type { FieldDefinition } from '../domain/fields/types.js';
import { validateEntryData, validateFieldDefinitions } from '../domain/fields/validator.js';

const BUNDLE_VERSION = 1;
const MAX_EXPORT_ASSETS = 120;
const MAX_ASSET_BASE64_BYTES = 4_000_000;

export type SiteBundleOptions = {
  siteSettings: boolean;
  contentTypes: boolean;
  contentTypeSlugsForEntries: string[];
  assets: boolean;
};

export type SiteImportSummary = {
  contentTypesUpserted: number;
  entriesCreated: number;
  entriesUpdated: number;
  assetsImported: number;
  siteSettingsApplied: boolean;
};

type ExportedContentType = {
  legacyId: string;
  name: string;
  slug: string;
  fields: unknown[];
  options: unknown;
};

type ExportedAsset = {
  exportId: string;
  legacyMongoId: string;
  filename: string;
  mimeType: string;
  alt: string;
  title: string;
  focalX: number;
  focalY: number;
  fileBase64?: string;
  skippedReason?: string;
};

type PortableMenuSlot = {
  slotKey: string;
  contentTypeSlug: string;
  entrySlug: string | null;
  entryName: string | null;
};

function toSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

async function buildPortableMenuSlots(siteId: string, menu: Record<string, string>): Promise<PortableMenuSlot[]> {
  const slots: PortableMenuSlot[] = [];
  for (const [slotKey, entryId] of Object.entries(menu)) {
    const entry = await EntryModel.findOne({ _id: entryId, siteId }).lean();
    if (!entry) continue;
    const ct = await ContentTypeModel.findOne({ _id: entry.contentTypeId, siteId }).lean();
    if (!ct) continue;
    slots.push({
      slotKey,
      contentTypeSlug: ct.slug,
      entrySlug: typeof entry.slug === 'string' && entry.slug ? entry.slug : null,
      entryName: typeof entry.name === 'string' ? entry.name : null,
    });
  }
  return slots;
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

/** Replace source-site asset ids with ids created during bundle import (`export-{legacyId}` map). */
function remapImageAssetIdsInData(
  fields: FieldDef[],
  data: Record<string, unknown>,
  assetExportIdToNewId: Map<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const field of fields) {
    const value = out[field.key];
    if (field.type === 'image' && value && typeof value === 'object' && !Array.isArray(value)) {
      const rec = { ...(value as Record<string, unknown>) };
      const oldId = rec.assetId;
      if (typeof oldId === 'string' && oldId.trim()) {
        const trimmed = oldId.trim();
        const mapped =
          assetExportIdToNewId.get(trimmed) ??
          assetExportIdToNewId.get(`export-${trimmed}`) ??
          (trimmed.startsWith('export-') ? assetExportIdToNewId.get(trimmed) : undefined);
        if (mapped) {
          rec.assetId = mapped;
          out[field.key] = rec;
        } else if (assetExportIdToNewId.size > 0) {
          // Bundle included an assets section but this file was missing or skipped — drop the ref so import can continue.
          delete out[field.key];
        }
      }
    }
    if (field.type === 'repeater' && Array.isArray(value)) {
      const nestedFields = (field.config?.fields ?? []) as FieldDef[];
      out[field.key] = (value as unknown[]).map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? remapImageAssetIdsInData(nestedFields, item as Record<string, unknown>, assetExportIdToNewId)
          : item,
      );
    }
  }
  return out;
}

async function assertAssetsBelongToSite(siteId: string, assetIds: string[]) {
  if (!assetIds.length) return;
  const assets = await AssetModel.find({ _id: { $in: assetIds }, siteId }).lean();
  const found = new Set(assets.map((asset) => String(asset._id)));
  const missing = assetIds.filter((id) => !found.has(String(id)));
  if (missing.length) throw new Error('One or more referenced assets are missing or outside this site');
}

function collectLegacyRefsInFields(fields: unknown[]): string[] {
  const ids: string[] = [];
  const walk = (arr: unknown[]) => {
    for (const f of arr) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
      const fe = f as Record<string, unknown>;
      if (fe.type === 'repeater' && fe.config && typeof fe.config === 'object') {
        const c = fe.config as Record<string, unknown>;
        const id = c.contentTypeId;
        if (typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)) ids.push(id);
        if (Array.isArray(c.fields)) walk(c.fields as unknown[]);
      }
    }
  };
  walk(fields);
  return [...new Set(ids)];
}

function remapFieldIdsInFields(fields: unknown[], idMap: Map<string, string>): unknown[] {
  return fields.map((f) => {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
    const fe = { ...(f as Record<string, unknown>) };
    if (fe.type === 'repeater' && fe.config && typeof fe.config === 'object') {
      const c = { ...(fe.config as Record<string, unknown>) };
      if (typeof c.contentTypeId === 'string' && idMap.has(c.contentTypeId)) {
        c.contentTypeId = idMap.get(c.contentTypeId)!;
      }
      if (Array.isArray(c.fields)) {
        c.fields = remapFieldIdsInFields(c.fields as unknown[], idMap);
      }
      fe.config = c;
    }
    return fe;
  });
}

function missingReferencedLegacyIds(fields: unknown[], idMap: Map<string, string>): string[] {
  const missing: string[] = [];
  for (const id of collectLegacyRefsInFields(fields)) {
    if (!idMap.has(id)) missing.push(id);
  }
  return missing;
}

function normalizeMenuEntriesMap(raw: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  const seen = new Set<string>();
  for (const [rawKey, value] of Object.entries(raw)) {
    const key = String(rawKey).trim();
    if (!key) continue;
    if (!MENU_SLOT_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid menu slot key "${key}".`);
    }
    if (seen.has(key)) throw new Error(`Duplicate menu slot key "${key}".`);
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

async function assertEntriesBelongToSite(siteId: string, entryIds: string[]) {
  const unique = [...new Set(entryIds.filter(Boolean))];
  if (!unique.length) return;
  const entries = await EntryModel.find({ _id: { $in: unique }, siteId }).select({ _id: 1 }).lean();
  const found = new Set(entries.map((e) => String(e._id)));
  const missing = unique.filter((id) => !found.has(String(id)));
  if (missing.length) throw new Error('One or more referenced entries are missing or outside this site');
}

async function portableMenuToMenuEntries(
  siteId: string,
  slots: PortableMenuSlot[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const slot of slots) {
    const ct = await ContentTypeModel.findOne({ siteId, slug: slot.contentTypeSlug }).lean();
    if (!ct) throw new Error(`Content type "${slot.contentTypeSlug}" not found for menu import`);
    let entry: { _id: unknown } | null = null;
    if (slot.entrySlug) {
      entry = await EntryModel.findOne({ siteId, contentTypeId: ct._id, slug: slot.entrySlug }).lean();
    } else if (slot.entryName?.trim()) {
      entry = await EntryModel.findOne({ siteId, contentTypeId: ct._id, name: slot.entryName.trim() }).lean();
    }
    if (!entry) {
      throw new Error(`Menu slot "${slot.slotKey}": entry not found for ${slot.contentTypeSlug}`);
    }
    out[slot.slotKey] = String(entry._id);
  }
  return out;
}

const ENTRY_NAME_MAX = 200;

function normalizeEntryName(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Display name is required.');
  const t = raw.trim();
  if (!t) throw new Error('Display name is required.');
  if (t.length > ENTRY_NAME_MAX) throw new Error(`Display name must be at most ${ENTRY_NAME_MAX} characters.`);
  return t;
}

async function assertEntryNameUnique(siteId: unknown, contentTypeId: unknown, name: string, excludeEntryId?: string) {
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

export async function exportSiteBundleService(
  siteId: string,
  options: SiteBundleOptions,
): Promise<Record<string, unknown>> {
  const bundle: Record<string, unknown> = {
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    siteId,
  };

  if (options.contentTypes) {
    const cts = await ContentTypeModel.find({ siteId }).lean();
    bundle.contentTypes = cts.map((ct) => ({
      legacyId: String(ct._id),
      name: ct.name,
      slug: ct.slug,
      fields: ct.fields ?? [],
      options: ct.options ?? {},
    })) as ExportedContentType[];
  }

  if (options.contentTypeSlugsForEntries?.length) {
    const groups: Array<{ contentTypeSlug: string; items: Array<{ name: string; slug: string | null; data: unknown }> }> =
      [];
    for (const slug of options.contentTypeSlugsForEntries) {
      const ct = await ContentTypeModel.findOne({ siteId, slug }).lean();
      if (!ct) continue;
      const entries = await EntryModel.find({ siteId, contentTypeId: ct._id }).limit(2000).lean();
      groups.push({
        contentTypeSlug: ct.slug,
        items: entries.map((e) => ({
          name: typeof e.name === 'string' ? e.name : '',
          slug: typeof e.slug === 'string' ? e.slug : null,
          data: e.data ?? {},
        })),
      });
    }
    bundle.entries = groups;
  }

  if (options.siteSettings) {
    const doc = await SiteSettingsModel.findOne({ siteId }).lean();
    const menuObj = menuEntriesToObject(doc?.menuEntries);
    const portable = await buildPortableMenuSlots(siteId, menuObj);
    bundle.siteSettings = {
      siteTitle: doc?.siteTitle != null ? String(doc.siteTitle).trim() || null : null,
      menuSlots: portable,
      logoAssetExportId: doc?.logoAssetId ? `export-${String(doc.logoAssetId)}` : null,
      faviconAssetExportId: doc?.faviconAssetId ? `export-${String(doc.faviconAssetId)}` : null,
    };
  }

  if (options.assets) {
    const storage = getStorageAdapter();
    const assets = await AssetModel.find({ siteId }).sort({ createdAt: -1 }).limit(MAX_EXPORT_ASSETS).lean();
    const exported: ExportedAsset[] = [];
    for (const a of assets) {
      const exportId = `export-${String(a._id)}`;
      try {
        const buf = await storage.getBuffer(a.storageKeyOriginal);
        if (buf.byteLength > MAX_ASSET_BASE64_BYTES) {
          exported.push({
            exportId,
            legacyMongoId: String(a._id),
            filename: a.filename,
            mimeType: a.mimeType,
            alt: a.alt ?? '',
            title: a.title ?? '',
            focalX: typeof a.focalX === 'number' ? a.focalX : 0.5,
            focalY: typeof a.focalY === 'number' ? a.focalY : 0.5,
            skippedReason: `Original exceeds ${MAX_ASSET_BASE64_BYTES} bytes`,
          });
          continue;
        }
        exported.push({
          exportId,
          legacyMongoId: String(a._id),
          filename: a.filename,
          mimeType: a.mimeType,
          alt: a.alt ?? '',
          title: a.title ?? '',
          focalX: typeof a.focalX === 'number' ? a.focalX : 0.5,
          focalY: typeof a.focalY === 'number' ? a.focalY : 0.5,
          fileBase64: buf.toString('base64'),
        });
      } catch {
        exported.push({
          exportId,
          legacyMongoId: String(a._id),
          filename: a.filename,
          mimeType: a.mimeType,
          alt: a.alt ?? '',
          title: a.title ?? '',
          focalX: 0.5,
          focalY: 0.5,
          skippedReason: 'Could not read file from storage',
        });
      }
    }
    bundle.assets = exported;
  }

  return bundle;
}

function isBundleV1(raw: unknown): raw is { version: number } {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as { version?: unknown }).version === 1);
}

export async function importSiteBundleService(
  siteId: string,
  userId: string,
  bundleUnknown: unknown,
  options: SiteBundleOptions,
): Promise<SiteImportSummary> {
  if (!isBundleV1(bundleUnknown)) {
    throw new Error('Invalid bundle: expected { "version": 1, ... }');
  }
  const bundle = bundleUnknown as Record<string, unknown>;

  const summary: SiteImportSummary = {
    contentTypesUpserted: 0,
    entriesCreated: 0,
    entriesUpdated: 0,
    assetsImported: 0,
    siteSettingsApplied: false,
  };

  const assetExportIdToNewId = new Map<string, string>();

  if (options.assets && Array.isArray(bundle.assets)) {
    for (const row of bundle.assets as ExportedAsset[]) {
      if (!row?.exportId || !row.fileBase64) continue;
      try {
        const newId = await persistImageUpload({
          siteId,
          userId,
          fileBase64: row.fileBase64,
          filename: row.filename || 'import',
          mimeType: row.mimeType || 'image/jpeg',
          alt: row.alt ?? '',
          title: row.title ?? '',
        });
        assetExportIdToNewId.set(row.exportId, newId);
        if (row.legacyMongoId) {
          assetExportIdToNewId.set(`export-${row.legacyMongoId}`, newId);
        }
        summary.assetsImported += 1;
      } catch {
        /* skip broken row */
      }
    }
  }

  const idMap = new Map<string, string>();

  if (options.contentTypes && Array.isArray(bundle.contentTypes)) {
    const exported = bundle.contentTypes as ExportedContentType[];
    const pending = new Set(exported.map((c) => c.legacyId));
    let guard = 0;
    while (pending.size && guard++ < 80) {
      for (const ct of exported) {
        if (!pending.has(ct.legacyId)) continue;
        const missing = missingReferencedLegacyIds(ct.fields as unknown[], idMap);
        if (missing.length) continue;

        const remappedFields = remapFieldIdsInFields(ct.fields as unknown[], idMap);
        const safeFields = validateFieldDefinitions(remappedFields as FieldDef[]);

        const normalizedSlug = toSlug(String(ct.slug ?? ''));
        if (!normalizedSlug) continue;

        const existing = await ContentTypeModel.findOne({ siteId, slug: normalizedSlug }).lean();
        await assertReferencedContentTypesExist(
          siteId,
          safeFields as FieldDef[],
          existing ? String(existing._id) : undefined,
        );
        if (existing) {
          await ContentTypeModel.findOneAndUpdate(
            { _id: existing._id, siteId },
            { name: ct.name, fields: safeFields, options: ct.options ?? {} },
            { new: true },
          );
          idMap.set(ct.legacyId, String(existing._id));
        } else {
          const created = await ContentTypeModel.create({
            siteId,
            name: ct.name,
            slug: normalizedSlug,
            fields: safeFields,
            options: ct.options ?? {},
          });
          idMap.set(ct.legacyId, String(created._id));
        }
        pending.delete(ct.legacyId);
        summary.contentTypesUpserted += 1;
      }
    }
    if (pending.size) {
      throw new Error(
        `Could not import all content types (missing repeater references or cycle). Pending: ${pending.size}`,
      );
    }
  }

  if (options.contentTypeSlugsForEntries?.length && Array.isArray(bundle.entries)) {
    const groups = bundle.entries as Array<{ contentTypeSlug: string; items: Array<{ name: string; slug: string | null; data: unknown }> }>;
    for (const slug of options.contentTypeSlugsForEntries) {
      const group = groups.find((g) => g.contentTypeSlug === slug);
      if (!group?.items?.length) continue;
      const ct = await ContentTypeModel.findOne({ siteId, slug }).lean();
      if (!ct) throw new Error(`Content type "${slug}" not found — import content types first.`);
        const hydratedFields = (await hydrateRepeaterFields(
          siteId,
          ct.fields as FieldDef[],
        )) as unknown as FieldDefinition[];

      for (const item of group.items) {
        const displayName = normalizeEntryName(item.name);
        const rawData = (item.data && typeof item.data === 'object' ? item.data : {}) as Record<string, unknown>;
        const data = remapImageAssetIdsInData(hydratedFields as FieldDef[], rawData, assetExportIdToNewId);
        validateEntryData(hydratedFields, data);
        await assertAssetsBelongToSite(siteId, collectImageAssetIds(hydratedFields as FieldDef[], data));
        await assertReferencedEntriesBelongToSite(siteId, hydratedFields as FieldDef[], data);
        const resolvedSlug = resolveEntrySlug(ct as { options?: Record<string, unknown> }, data, item.slug, displayName);

        const existing = await EntryModel.findOne(
          resolvedSlug != null && resolvedSlug !== ''
            ? { siteId, contentTypeId: ct._id, slug: resolvedSlug }
            : { siteId, contentTypeId: ct._id, name: displayName },
        ).lean();

        if (existing) {
          await assertEntryNameUnique(siteId, ct._id, displayName, String(existing._id));
          await EntryModel.findOneAndUpdate(
            { _id: existing._id, siteId },
            { name: displayName, slug: resolvedSlug, data, updatedBy: userId },
            { new: true },
          );
          summary.entriesUpdated += 1;
        } else {
          await assertEntryNameUnique(siteId, ct._id, displayName);
          await EntryModel.create({
            siteId,
            contentTypeId: ct._id,
            name: displayName,
            slug: resolvedSlug,
            data,
            updatedBy: userId,
          });
          summary.entriesCreated += 1;
        }
      }
    }
  }

  if (options.siteSettings && bundle.siteSettings && typeof bundle.siteSettings === 'object') {
    const ss = bundle.siteSettings as {
      siteTitle?: string | null;
      menuSlots?: PortableMenuSlot[];
      logoAssetExportId?: string | null;
      faviconAssetExportId?: string | null;
    };
    const $set: Record<string, unknown> = {};

    if (Array.isArray(ss.menuSlots)) {
      const menuObj = await portableMenuToMenuEntries(siteId, ss.menuSlots);
      const menuMap = normalizeMenuEntriesMap(menuObj);
      await assertEntriesBelongToSite(siteId, [...menuMap.values()]);
      $set.menuEntries = menuMap;
    }

    if (Object.prototype.hasOwnProperty.call(ss, 'siteTitle')) {
      $set.siteTitle =
        ss.siteTitle === null || ss.siteTitle === undefined ? null : String(ss.siteTitle).trim() || null;
    }

    const existingSs = await SiteSettingsModel.findOne({ siteId }).lean();
    if (typeof ss.logoAssetExportId === 'string' && ss.logoAssetExportId && assetExportIdToNewId.has(ss.logoAssetExportId)) {
      $set.logoAssetId = assetExportIdToNewId.get(ss.logoAssetExportId)!;
    }
    if (
      typeof ss.faviconAssetExportId === 'string' &&
      ss.faviconAssetExportId &&
      assetExportIdToNewId.has(ss.faviconAssetExportId)
    ) {
      $set.faviconAssetId = assetExportIdToNewId.get(ss.faviconAssetExportId)!;
    }

    const nextLogo = Object.prototype.hasOwnProperty.call($set, 'logoAssetId')
      ? ($set.logoAssetId as string | null)
      : existingSs?.logoAssetId
        ? String(existingSs.logoAssetId)
        : null;
    const nextFav = Object.prototype.hasOwnProperty.call($set, 'faviconAssetId')
      ? ($set.faviconAssetId as string | null)
      : existingSs?.faviconAssetId
        ? String(existingSs.faviconAssetId)
        : null;
    const assetIds = [nextLogo, nextFav].filter(Boolean) as string[];
    if (assetIds.length) await assertAssetsBelongToSite(siteId, assetIds);

    if (Object.keys($set).length === 0) {
      summary.siteSettingsApplied = false;
    } else {
      await SiteSettingsModel.findOneAndUpdate(
        { siteId },
        { $set, $setOnInsert: { siteId } },
        { upsert: true, new: true },
      );
      summary.siteSettingsApplied = true;
    }
  }

  return summary;
}
