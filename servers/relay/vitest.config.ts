import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineProject({
  resolve: {
    alias: [
      { find: /^@blacklight\/core$/, replacement: source('../../packages/core/src/index.ts') },
      {
        find: /^@blacklight\/net\/protocol$/,
        replacement: source('../../packages/net/src/protocol.ts'),
      },
      { find: /^@blacklight\/net$/, replacement: source('../../packages/net/src/index.ts') },
    ],
  },
  test: { name: 'relay', include: ['test/**/*.spec.ts'] },
});
