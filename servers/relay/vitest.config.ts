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
      {
        find: /^@blacklight\/net\/testing$/,
        replacement: source('../../packages/net/src/testing.ts'),
      },
      { find: /^@blacklight\/net$/, replacement: source('../../packages/net/src/index.ts') },
      // test/party-game.spec.ts runs the party-game template's scenes over this relay.
      { find: /^@objects\//, replacement: source('../../templates/party-game/objects/') },
      { find: /^@ui\//, replacement: source('../../templates/party-game/ui/') },
      { find: /^@assets\//, replacement: source('../../templates/party-game/assets/') },
    ],
  },
  test: { name: 'relay', include: ['test/**/*.spec.ts'] },
});
