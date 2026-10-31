import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      '!packages/modules',
      // Core code that needs a real browser (WebGL, Web Audio, IndexedDB, DOM events): headless
      // Chromium through Playwright.
      'packages/core/vitest.browser.config.ts',
      'packages/modules/*',
      // Folders only: servers/ also holds docker-compose.yml.
      'servers/*/vitest.config.ts',
      'scripts',
      // Template rules and their online variants (headless, no browser).
      'templates/party-game',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'packages/modules/*/src/**'],
      reporter: ['text', 'html'],
    },
  },
});
