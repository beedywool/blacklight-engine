import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', config: 'src/config-entry.ts', debug: 'src/debug/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  target: 'es2023',
  external: ['pixi.js', 'motion'],
});
