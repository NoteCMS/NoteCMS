/** Maximum `limit` the SDK will send for `entries` / `listAssets` (client-side guard; API may still allow higher). */
export const MAX_GRAPHQL_PAGE_SIZE = 200;

/** Default page size for snapshot entry pagination. */
export const DEFAULT_SNAPSHOT_ENTRY_PAGE_SIZE = 100;

/** Default max concurrent content-type fetches inside {@link fetchBuildSnapshot}. */
export const DEFAULT_SNAPSHOT_MAX_CONCURRENT_TYPES = 4;

/**
 * Version of the JSON shape returned by {@link fetchBuildSnapshot}.
 * Increment when adding/removing top-level snapshot fields so consumers can migrate.
 */
export const SNAPSHOT_FORMAT_VERSION = 1 as const;
