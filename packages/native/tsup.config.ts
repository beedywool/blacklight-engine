import { defineConfig } from 'tsup';

// Native addons and Electron stay outside the bundles: the app loads them from its node_modules.
const nodeExternal = ['electron', '@kmamal/sdl', 'steamworks.js', 'bytenode', 'electron-builder', '@electron/fuses'];

export default defineConfig([
  {
    // Game side: runs in the page, like the other engine packages.
    entry: { index: 'src/index.ts', 'define-native': 'src/define-native.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    target: 'es2023',
    external: ['@blacklight/core'],
  },
  {
    // Main process and preload: CommonJS (sandboxed preloads and V8 bytecode need it), with every
    // engine dependency bundled so the packaged app only ships native addons.
    entry: { 'main/index': 'src/main/index.ts', preload: 'src/preload/index.ts' },
    format: ['cjs'],
    dts: { entry: { 'main/index': 'src/main/index.ts' } },
    sourcemap: true,
    target: 'node24',
    platform: 'node',
    external: nodeExternal,
    noExternal: [/^@blacklight\/core/],
    outExtension: () => ({ js: '.cjs' }),
  },
  {
    // Packaging helpers for the CLI (Node, ESM).
    entry: { 'build/index': 'src/build/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    target: 'node24',
    platform: 'node',
    external: nodeExternal,
  },
]);
