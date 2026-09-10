import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  optimizeDeps: {
    // face-api ships a large UMD bundle; keep it out of pre-bundling so it is loaded lazily.
    exclude: ['@vladmandic/face-api'],
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
