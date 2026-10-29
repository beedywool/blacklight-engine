import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineProject({
  // Tests run against the core sources, so classes match the scene helper's.
  resolve: {
    alias: [
      { find: /^@blacklight\/core$/, replacement: source('../core/src/index.ts') },
      // The e2e fixture's scenes (gate test) import the package by name: use these sources too.
      { find: /^@blacklight\/net\/testing$/, replacement: source('./src/testing.ts') },
      { find: /^@blacklight\/net$/, replacement: source('./src/index.ts') },
    ],
  },
  test: { name: 'net', include: ['test/**/*.spec.ts'], testTimeout: 300_000 },
});
