import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Ports come from the repo-root .env shared with the backend and scripts/.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = Number(env.API_PORT ?? 8000);
  const webPort = Number(env.WEB_PORT ?? 5173);

  return {
    plugins: [react()],
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': { target: `http://127.0.0.1:${apiPort}` },
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
