import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const core = (path: string) => fileURLToPath(new URL(`../core/src/${path}`, import.meta.url));

export default defineProject({
  // Tests run against the core sources (the entry points the package imports).
  resolve: {
    alias: [
      { find: '@blacklight/core/config', replacement: core('config-entry.ts') },
      { find: '@blacklight/core/schema', replacement: core('schema-entry.ts') },
      { find: /^@blacklight\/core$/, replacement: core('index.ts') },
    ],
  },
  test: { name: 'native', include: ['test/**/*.spec.ts'] },
});
