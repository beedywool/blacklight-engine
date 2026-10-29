import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', ui: 'src/ui.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  target: 'es2023',
  // three stays external: games bundle its loaders, whose Draco/KTX2 decoders Vite emits as files.
  external: ['@blacklight/core', '@blacklight/ui', 'pixi.js', 'vue', /^three($|\/)/],
});
