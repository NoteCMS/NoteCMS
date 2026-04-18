/** Build GraphQL URL from the current page origin, swapping port and path (same host/protocol as the UI). */
function graphqlUrlFromPageLocation(port: string, graphPath: string): string {
  const path = graphPath.startsWith('/') ? graphPath : `/${graphPath}`;
  const u = new URL(window.location.href);
  u.port = port;
  u.pathname = path;
  u.search = '';
  u.hash = '';
  return u.toString();
}

/** Browser GraphQL HTTP endpoint: runtime config (Docker) then Vite env for local dev. */
export function getGraphqlEndpoint(): string {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_URL ?? 'http://localhost:4000/graphql';
  }

  const full = window.__NOTECMS_GRAPHQL_URL__;
  if (full && full.length > 0) return full;

  const port = window.__NOTECMS_GRAPHQL_PORT__;
  if (port && port.length > 0) {
    const path = window.__NOTECMS_GRAPHQL_PATH__?.length ? window.__NOTECMS_GRAPHQL_PATH__ : '/graphql';
    return graphqlUrlFromPageLocation(port, path);
  }

  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

  const vitePort = import.meta.env.VITE_GRAPHQL_PORT;
  if (vitePort && vitePort.length > 0) {
    const path =
      import.meta.env.VITE_GRAPHQL_PATH && import.meta.env.VITE_GRAPHQL_PATH.length > 0
        ? import.meta.env.VITE_GRAPHQL_PATH
        : '/graphql';
    return graphqlUrlFromPageLocation(vitePort, path);
  }

  return 'http://localhost:4000/graphql';
}
