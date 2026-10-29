import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2023',
  // Capacitor packages stay imports: the game's bundler resolves one copy of each.
  external: [
    /^@blacklight\//,
    /^@capacitor\//,
    /^@capacitor-community\//,
    'capacitor-secure-storage-plugin',
  ],
});
