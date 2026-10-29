import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: { '@blacklight/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: { name: 'native', include: ['test/**/*.spec.ts'] },
});
