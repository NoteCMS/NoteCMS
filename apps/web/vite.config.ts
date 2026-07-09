import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/** UI primitives: prefer **Radix** for new work; **Base UI** remains for existing surfaces until migrated. */
/** Dev / preview: HMR needs unsafe-eval; connect allows local + TLS .localhost (e.g. portless). */
const spaSecurityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' ws: wss: http: https:",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Frame-Options': 'DENY',
} as const;

export default defineConfig(({ command, mode }) => {
  // loadEnv: read `.env`, `.env.local`, `.env.[mode]` (e.g. `.env.portless`) for use in this file.
  // Third arg '' = include all keys (not only VITE_*), so NOTECMS_PORTLESS_API is available.
  const env = loadEnv(mode, process.cwd(), '');
  // Portless sets PORT (and optionally PORTLESS_APP_PORT). Must match proxy registration or you get 404 / bad gateway.
  const rawPort = process.env.PORT ?? process.env.PORTLESS_APP_PORT;
  const parsedPort = rawPort ? Number(rawPort) : NaN;
  const assignedPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : undefined;
  const portlessApi = env.NOTECMS_PORTLESS_API || process.env.NOTECMS_PORTLESS_API;
  const useGraphqlProxy = (env.VITE_USE_GRAPHQL_PROXY || process.env.VITE_USE_GRAPHQL_PROXY) === 'true' && Boolean(portlessApi);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Listen on all interfaces so the Portless proxy can reach this process (see Portless troubleshooting).
      // Do not bind only 127.0.0.1 here — that can break routing depending on how the proxy connects.
      host: '0.0.0.0',
      port: assignedPort ?? 5173,
      strictPort: Boolean(assignedPort),
      proxy: useGraphqlProxy
        ? {
            '/graphql': {
              target: portlessApi,
              changeOrigin: true,
              secure: false,
            },
          }
        : undefined,
      headers: command === 'serve' ? { ...spaSecurityHeaders } : undefined,
    },
    preview: {
      headers: { ...spaSecurityHeaders },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
