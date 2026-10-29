import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', protocol: 'src/protocol.ts', testing: 'src/testing.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  target: 'es2023',
  external: ['@blacklight/core'],
});
