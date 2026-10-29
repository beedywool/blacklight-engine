import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  // Tests run against the sources of the engine and of the modules this one depends on.
  resolve: {
    alias: {
      '@blacklight/core': fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)),
      '@blacklight/module-http': fileURLToPath(new URL('../http/src/index.ts', import.meta.url)),
    },
  },
  test: { name: 'module-achievements', include: ['test/**/*.spec.ts'] },
});
