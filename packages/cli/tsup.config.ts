import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/vite.ts'],
  format: ['esm'],
  dts: { entry: 'src/vite.ts' },
  sourcemap: true,
  clean: true,
  target: 'node24',
  platform: 'node',
});
