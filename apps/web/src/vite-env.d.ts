/// <reference types="vite/client" />

interface Window {
  __NOTECMS_GRAPHQL_URL__?: string;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
