import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [vue()],
  resolve: {
    alias: { '@blacklight/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: {
    name: 'ui',
    include: ['test/**/*.spec.ts'],
    environment: 'happy-dom',
    setupFiles: ['test/setup.ts'],
  },
});
