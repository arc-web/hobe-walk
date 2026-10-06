import { defineConfig } from 'vite';

export default defineConfig({
  // Relative so the built site runs from any folder, including a bucket prefix.
  base: './',
  build: {
    outDir: 'dist',
    target: 'esnext',
    sourcemap: false,
    // Three.js is large. Keep it in one chunk so the page makes a single request.
    chunkSizeWarningLimit: 1400,
  },
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
  },
});
