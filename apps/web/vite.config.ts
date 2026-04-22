import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const portlessPort = process.env.PORT ? Number(process.env.PORT) : undefined;
const portlessApi = process.env.NOTECMS_PORTLESS_API;
const useGraphqlProxy = process.env.VITE_USE_GRAPHQL_PROXY === 'true' && Boolean(portlessApi);

export default defineConfig({
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
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
