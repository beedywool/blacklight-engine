import { defineConfig } from 'tsup';

// The extension host loads CommonJS: the extension and its tests are bundled to .cjs with every
// dependency (TypeScript included) except the `vscode` module the host provides.
export default defineConfig([
  {
    entry: { extension: 'src/extension.ts' },
    outDir: 'dist',
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    platform: 'node',
    target: 'node20',
    external: ['vscode'],
    noExternal: [/^(?!vscode$)/],
    minify: true,
    clean: true,
  },
  {
    entry: {
      animation: 'webview/animation.ts',
      slicer: 'webview/slicer.ts',
      scene: 'webview/scene.ts',
      timeline: 'webview/timeline.ts',
      'ui-preview': 'webview/ui-preview.ts',
      config: 'webview/config.ts',
      assets: 'webview/assets.ts',
    },
    outDir: 'dist-webview',
    format: ['iife'],
    outExtension: () => ({ js: '.js' }),
    platform: 'browser',
    target: 'es2022',
    minify: true,
    clean: true,
  },
  {
    entry: { suite: 'test/integration/suite.ts' },
    outDir: 'dist-test',
    format: ['cjs'],
    outExtension: () => ({ js: '.cjs' }),
    platform: 'node',
    target: 'node20',
    external: ['vscode'],
    noExternal: [/^(?!vscode$)/],
    clean: true,
  },
]);
