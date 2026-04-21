import type { NoteCmsClient } from './client.js';
import {
  DEFAULT_SNAPSHOT_ENTRY_PAGE_SIZE,
  DEFAULT_SNAPSHOT_MAX_CONCURRENT_TYPES,
  MAX_GRAPHQL_PAGE_SIZE,
  SNAPSHOT_FORMAT_VERSION,
} from './constants.js';
import { contentTypeHasSlug } from './paths.js';
import type { Asset, ContentType, Entry, SiteSettings } from './types.js';

/**
 * Full-site read model for static generation. Entries per type are ordered **newest first** by the API
 * (`updatedAt` descending). Pagination is applied sequentially per content type; **under concurrent CMS
 * writes**, the snapshot is **best-effort** (an entry may theoretically appear twice or be skipped across
 * page boundaries). For CI builds against stable content this is usually irrelevant.
 */
export type BuildSnapshot = {
  /** Increment when the shape of this object changes (see package constant). */
  snapshotFormatVersion: typeof SNAPSHOT_FORMAT_VERSION;
  /** ISO timestamp when the snapshot finished assembling. */
  fetchedAt: string;
  siteId: string;
  site: SiteSettings;
  contentTypes: ContentType[];
  /** Entries grouped by content type **slug**, each array ordered newest-first (API order). */
  entriesByTypeSlug: Record<string, Entry[]>;
  entriesById: Record<string, Entry>;
  /**
   * For content types with `options.hasSlug`, maps `typeSlug → entrySlug → entry`.
   * If an invalid duplicate slug ever existed, the **last** entry seen in the per-type list wins.
   */
  slugIndex: Record<string, Record<string, Entry>>;
  /** Present when `includeAssets` is not `false`; built from paginated `listAssets`. */
  assetsById?: Record<string, Asset>;
};

export type FetchBuildSnapshotOptions = {
  /**
   * `true` | `'index'`: paginate all assets into `assetsById`.
   * `false`: omit asset map (smaller snapshot; resolve images via separate `listAssets` calls if needed).
   */
  includeAssets?: boolean | 'index';
  /** Page size for entry pagination per content type (clamped 1…{@link MAX_GRAPHQL_PAGE_SIZE}). */
  entryPageSize?: number;
  assetPageSize?: number;
  /** Parallelism when fetching entries per content type. */
  maxConcurrentTypes?: number;
};

async function fetchAllEntriesForType(
  client: NoteCmsClient,
  contentTypeId: string,
  pageSize: number,
): Promise<Entry[]> {
  const out: Entry[] = [];
  let offset = 0;
  while (true) {
    const batch = await client.entries(contentTypeId, { limit: pageSize, offset });
    out.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function fetchAllAssets(client: NoteCmsClient, pageSize: number): Promise<Asset[]> {
  const out: Asset[] = [];
  let offset = 0;
  while (true) {
    const batch = await client.listAssets({ limit: pageSize, offset });
    out.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

/**
 * Pull site settings, all content types, all entries (paginated), optional full asset index, and derived
 * maps for static builds. Uses only API-key-safe read queries.
 */
export async function fetchBuildSnapshot(
  client: NoteCmsClient,
  options: FetchBuildSnapshotOptions = {},
): Promise<BuildSnapshot> {
  const entryPageSize = Math.min(
    MAX_GRAPHQL_PAGE_SIZE,
    Math.max(1, options.entryPageSize ?? DEFAULT_SNAPSHOT_ENTRY_PAGE_SIZE),
  );
  const assetPageSize = Math.min(
    MAX_GRAPHQL_PAGE_SIZE,
    Math.max(1, options.assetPageSize ?? 100),
  );
  const maxConcurrent = Math.max(1, options.maxConcurrentTypes ?? DEFAULT_SNAPSHOT_MAX_CONCURRENT_TYPES);
  const includeAssets = options.includeAssets ?? true;

  const [site, contentTypes] = await Promise.all([client.siteSettings(), client.contentTypes()]);

  const entriesByTypeSlug: Record<string, Entry[]> = {};
  await mapWithConcurrency(contentTypes, maxConcurrent, async (ct) => {
    entriesByTypeSlug[ct.slug] = await fetchAllEntriesForType(client, ct.id, entryPageSize);
  });

  const entriesById: Record<string, Entry> = {};
  const slugIndex: Record<string, Record<string, Entry>> = {};

  for (const ct of contentTypes) {
    const list = entriesByTypeSlug[ct.slug] ?? [];
    for (const entry of list) {
      entriesById[entry.id] = entry;
      if (!contentTypeHasSlug(ct)) continue;
      const slug = entry.slug;
      if (typeof slug !== 'string' || !slug.trim()) continue;
      const inner = (slugIndex[ct.slug] ??= {});
      inner[slug] = entry;
    }
  }

  let assetsById: Record<string, Asset> | undefined;
  if (includeAssets) {
    const assets = await fetchAllAssets(client, assetPageSize);
    assetsById = {};
    for (const a of assets) {
      assetsById[a.id] = a;
    }
  }

  return {
    snapshotFormatVersion: SNAPSHOT_FORMAT_VERSION,
    fetchedAt: new Date().toISOString(),
    siteId: client.siteId,
    site,
    contentTypes,
    entriesByTypeSlug,
    entriesById,
    slugIndex,
    assetsById,
  };
}
