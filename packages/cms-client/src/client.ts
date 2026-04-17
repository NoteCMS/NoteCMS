import { CONTENT_TYPES, ENTRIES, ENTRY, ENTRY_BY_SLUG, LIST_ASSETS } from './operations.js';
import { postGraphql } from './request.js';
import type { Asset, ContentType, Entry } from './types.js';

export type CmsClientConfig = {
  /** GraphQL HTTP URL, e.g. `https://api.example.com/graphql` */
  endpoint: string;
  /** Site-scoped API key (`ncms_v1_…`) */
  apiKey: string;
  /** Workspace / site id from the CMS */
  siteId: string;
  /** How to send the API key (default matches Postman `Authorization: Bearer`) */
  authHeader?: 'bearer' | 'x-api-key';
  /**
   * Optional `fetch` (pass SvelteKit’s `event.fetch`, Next.js `fetch` bound to cache, etc.).
   * Defaults to global `fetch`.
   */
  fetch?: typeof fetch;
};

export type CmsClient = {
  readonly siteId: string;
  readonly endpoint: string;

  /** Raw GraphQL POST; same auth as other methods. */
  query<TData>(query: string, variables?: Record<string, unknown>): Promise<TData>;

  contentTypes(): Promise<ContentType[]>;
  entries(contentTypeId: string, options?: { limit?: number; offset?: number }): Promise<Entry[]>;
  entry(id: string): Promise<Entry | null>;
  entryBySlug(contentTypeSlug: string, slug: string): Promise<Entry | null>;
  listAssets(options?: { query?: string; limit?: number; offset?: number }): Promise<Asset[]>;
};

/**
 * Create a read-only CMS client for public sites (API key).
 *
 * @example
 * ```ts
 * const cms = createCmsClient({
 *   endpoint: import.meta.env.VITE_CMS_GRAPHQL_URL,
 *   apiKey: import.meta.env.VITE_CMS_API_KEY,
 *   siteId: import.meta.env.VITE_CMS_SITE_ID,
 * });
 * const page = await cms.entryBySlug('pages', 'home');
 * ```
 */
export function createCmsClient(config: CmsClientConfig): CmsClient {
  const { endpoint, apiKey, siteId, authHeader = 'bearer' } = config;
  const fetchImpl = config.fetch ?? globalThis.fetch;

  async function query<TData>(queryString: string, variables?: Record<string, unknown>): Promise<TData> {
    return postGraphql<TData>(endpoint, { query: queryString, variables }, { apiKey, fetchImpl, authHeader });
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
      const data = await query<{ entries: Entry[] }>(ENTRIES, {
        siteId,
        contentTypeId,
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
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
      const data = await query<{ listAssets: Asset[] }>(LIST_ASSETS, {
        siteId,
        query: options.query ?? '',
        limit: options.limit ?? 30,
        offset: options.offset ?? 0,
      });
      return data.listAssets;
    },
  };
}
