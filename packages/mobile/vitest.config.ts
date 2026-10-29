import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  // Tests run against the core sources, like the other engine packages.
  resolve: {
    alias: { '@blacklight/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: { name: 'mobile', include: ['test/**/*.spec.ts'] },
});
