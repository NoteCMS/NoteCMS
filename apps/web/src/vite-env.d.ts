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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
