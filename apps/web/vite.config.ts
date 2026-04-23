import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const portlessPort = process.env.PORT ? Number(process.env.PORT) : undefined;
const portlessApi = process.env.NOTECMS_PORTLESS_API;
const useGraphqlProxy = process.env.VITE_USE_GRAPHQL_PROXY === 'true' && Boolean(portlessApi);

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

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    // Portless injects PORT; otherwise keep the default Vite port and bind all interfaces.
    host: portlessPort ? '127.0.0.1' : '0.0.0.0',
    port: portlessPort ?? 5173,
    strictPort: Boolean(portlessPort),
    proxy: useGraphqlProxy
      ? {
          '/graphql': {
            target: portlessApi,
            changeOrigin: true,
            secure: true,
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
}));
