import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  // Tests run against the core sources, so classes match the scene helper's.
  resolve: {
    alias: { '@blacklight/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: { name: 'three', include: ['test/**/*.spec.ts'] },
});
