import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const folder = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

// Unit tests of the mini-game rules and their online variants, without a browser: scenes run on
// the headless game of `@blacklight/net/testing`.
export default defineConfig({
  resolve: {
    alias: { '@objects': folder('objects'), '@ui': folder('ui'), '@assets': folder('assets') },
  },
  test: { name: 'party-game', include: ['test/**/*.spec.ts'], testTimeout: 60_000 },
});
