import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineProject({
  // Tests run against the engine sources. Exact-match aliases: `@blacklight/core/schema` must not
  // be rewritten by the `@blacklight/core` entry.
  resolve: {
    alias: [
      {
        find: /^@blacklight\/core\/schema$/,
        replacement: source('../../core/src/schema-entry.ts'),
      },
      { find: /^@blacklight\/core$/, replacement: source('../../core/src/index.ts') },
      {
        find: /^@blacklight\/native\/define-native$/,
        replacement: source('../../native/src/define-native.ts'),
      },
    ],
  },
  test: { name: 'module-sqlite', include: ['test/**/*.spec.ts'], environment: 'node' },
});
