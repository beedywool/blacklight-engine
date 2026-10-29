import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', native: 'src/native.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2023',
  external: ['@blacklight/core', 'sql.js', 'better-sqlite3', '@blacklight/native'],
});
