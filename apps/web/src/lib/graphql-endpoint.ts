/** Browser GraphQL HTTP endpoint: runtime config (Docker) then Vite env for local dev. */
export function getGraphqlEndpoint(): string {
  const runtime = typeof window !== 'undefined' ? window.__NOTECMS_GRAPHQL_URL__ : undefined;
  if (runtime && runtime.length > 0) return runtime;
  return import.meta.env.VITE_API_URL ?? 'http://localhost:4000/graphql';
}
