import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scaffold.ts'],
  format: ['esm'],
  dts: { entry: 'src/scaffold.ts' },
  clean: true,
  target: 'node24',
  platform: 'node',
});
