/// <reference types="vite/client" />

interface Window {
  __NOTECMS_GRAPHQL_URL__?: string;
  __NOTECMS_GRAPHQL_PORT__?: string;
  __NOTECMS_GRAPHQL_PATH__?: string;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Same-host as the dev server; builds GraphQL URL as current origin with this port + path. */
  readonly VITE_GRAPHQL_PORT?: string;
  readonly VITE_GRAPHQL_PATH?: string;
  /** When true, use same-origin `/graphql` (Vite dev proxy to API). */
  readonly VITE_USE_GRAPHQL_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
