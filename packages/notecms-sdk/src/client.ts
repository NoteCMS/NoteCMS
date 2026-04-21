import {
  CONTENT_TYPES,
  ENTRIES,
  ENTRY,
  ENTRY_BY_SLUG,
  LIST_ASSETS,
  SITE_SETTINGS,
} from './operations.js';
import { postGraphql } from './request.js';
import { MAX_GRAPHQL_PAGE_SIZE } from './constants.js';
import type { Asset, ContentType, Entry, SiteSettings } from './types.js';

export type NoteCmsClientConfig = {
  /** GraphQL HTTP endpoint URL (POST, JSON body). */
  endpoint: string;
  /** Site-scoped API key (`ncms_v1_…`). Never use `VITE_*` env vars for this — see README. */
  apiKey: string;
  siteId: string;
  /** How to send the API key (default: `Authorization: Bearer`). */
  authHeader?: 'bearer' | 'x-api-key';
  /**
   * Optional `fetch` (e.g. SvelteKit `event.fetch` in `load`).
   * Defaults to global `fetch`.
   */
  fetch?: typeof fetch;
  /**
   * Merged into every GraphQL `fetch` (e.g. `{ cache: 'no-store' }` during local dev).
   * `method`, `headers`, and `body` are always overridden for a valid GraphQL POST; auth headers win over
   * duplicate keys supplied here.
   */
  fetchInit?: RequestInit;
};

export type NoteCmsClient = {
  readonly siteId: string;
  readonly endpoint: string;

  /** Raw GraphQL POST; same auth as other methods. */
  query<TData>(query: string, variables?: Record<string, unknown>): Promise<TData>;

  contentTypes(): Promise<ContentType[]>;
  entries(contentTypeId: string, options?: { limit?: number; offset?: number }): Promise<Entry[]>;
  entry(id: string): Promise<Entry | null>;
  entryBySlug(contentTypeSlug: string, slug: string): Promise<Entry | null>;
  listAssets(options?: { query?: string; limit?: number; offset?: number }): Promise<Asset[]>;

  /** Site title, branding URLs, and resolved menu slots → entries (read-only; API key allowed). */
  siteSettings(): Promise<SiteSettings>;
};

function clampPageSize(requested: number | undefined, fallback: number): number {
  const n = requested ?? fallback;
  return Math.min(MAX_GRAPHQL_PAGE_SIZE, Math.max(1, n));
}

/**
 * Create a read-only NoteCMS client (site API key or compatible Bearer token).
 *
 * @example Server-only (SvelteKit `+page.server.ts`):
 * ```ts
 * import { NOTECMS_GRAPHQL_URL, NOTECMS_API_KEY, NOTECMS_SITE_ID } from '$env/static/private';
 * import { createNoteCmsClient } from '@notecms/sdk';
 *
 * const cms = createNoteCmsClient({
 *   endpoint: NOTECMS_GRAPHQL_URL,
 *   apiKey: NOTECMS_API_KEY,
 *   siteId: NOTECMS_SITE_ID,
 *   fetchInit: { cache: 'no-store' },
 * });
 * const page = await cms.entryBySlug('pages', 'home');
 * ```
 */
export function createNoteCmsClient(config: NoteCmsClientConfig): NoteCmsClient {
  const { endpoint, apiKey, siteId, authHeader = 'bearer', fetchInit } = config;
  const fetchImpl = config.fetch ?? globalThis.fetch;

  async function query<TData>(queryString: string, variables?: Record<string, unknown>): Promise<TData> {
    return postGraphql<TData>(endpoint, { query: queryString, variables }, { apiKey, fetchImpl, authHeader, fetchInit });
  }

  return {
    siteId,
    endpoint,

    query,

    async contentTypes() {
      const data = await query<{ contentTypes: ContentType[] }>(CONTENT_TYPES, { siteId });
      return data.contentTypes;
    },

    async entries(contentTypeId, options = {}) {
      const limit = clampPageSize(options.limit, 50);
      const offset = Math.max(0, options.offset ?? 0);
      const data = await query<{ entries: Entry[] }>(ENTRIES, {
        siteId,
        contentTypeId,
        limit,
        offset,
      });
      return data.entries;
    },

    async entry(id) {
      const data = await query<{ entry: Entry | null }>(ENTRY, { siteId, id });
      return data.entry ?? null;
    },

    async entryBySlug(contentTypeSlug, slug) {
      const data = await query<{ entryBySlug: Entry | null }>(ENTRY_BY_SLUG, {
        siteId,
        contentTypeSlug,
        slug,
      });
      return data.entryBySlug ?? null;
    },

    async listAssets(options = {}) {
      const limit = clampPageSize(options.limit, 30);
      const offset = Math.max(0, options.offset ?? 0);
      const data = await query<{ listAssets: Asset[] }>(LIST_ASSETS, {
        siteId,
        query: options.query ?? '',
        limit,
        offset,
      });
      return data.listAssets;
    },

    async siteSettings() {
      const data = await query<{ siteSettings: SiteSettings }>(SITE_SETTINGS, { siteId });
      return data.siteSettings;
    },
  };
}

/**
 * Same as {@link createNoteCmsClient} with `fetchInit: { cache: 'no-store', ...fetchInit }` so each
 * `load`/navigation refetches from NoteCMS during local development.
 */
export function createDevNoteCmsClient(
  config: Omit<NoteCmsClientConfig, 'fetchInit'> & { fetchInit?: RequestInit },
): NoteCmsClient {
  const { fetchInit: userInit, ...rest } = config;
  return createNoteCmsClient({
    ...rest,
    fetchInit: { cache: 'no-store', ...userInit },
  });
}

/**
 * @deprecated Use {@link createNoteCmsClient}.
 */
export const createCmsClient = createNoteCmsClient;

/**
 * @deprecated Use {@link NoteCmsClientConfig}.
 */
export type CmsClientConfig = NoteCmsClientConfig;

/**
 * @deprecated Use {@link NoteCmsClient}.
 */
export type CmsClient = NoteCmsClient;
