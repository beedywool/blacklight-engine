// Builds the example runner (the page inside every live example and the playground) into
// docs/public/runner/, which VitePress copies as is. It bundles the engine packages from their dist.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  logLevel: 'warn',
  resolve: { dedupe: ['vue', 'pixi.js'] },
  build: {
    outDir: fileURLToPath(new URL('../public/runner', import.meta.url)),
    emptyOutDir: true,
    target: 'es2023',
    chunkSizeWarningLimit: 4096,
  },
});
