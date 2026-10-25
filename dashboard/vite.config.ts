import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// En développement, /api est relayé vers l'API NestJS (le tableau de bord n'a donc pas besoin de CORS).
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', rewrite: (path) => path.replace(/^\/api/, '') } },
  },
  test: { environment: 'jsdom' },
});
