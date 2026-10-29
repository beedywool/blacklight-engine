import { defineConfig } from 'tsup';

export default defineConfig([
  // Library and CLI (npm, Electron main process): `ws` stays a dependency; the protocol module
  // of @blacklight/net is bundled so the server does not depend on the client package.
  {
    entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
    format: ['esm'],
    dts: { entry: { index: 'src/index.ts' } },
    sourcemap: true,
    clean: true,
    target: 'node22',
    platform: 'node',
    external: ['ws'],
    noExternal: ['@blacklight/net'],
  },
  // Docker image: one self-contained file, no npm install in the image.
  {
    entry: { relay: 'src/cli.ts' },
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    target: 'node22',
    platform: 'node',
    noExternal: ['ws', '@blacklight/net'],
    // Optional native speed-ups of ws; it works without them.
    external: ['bufferutil', 'utf-8-validate'],
  },
]);
