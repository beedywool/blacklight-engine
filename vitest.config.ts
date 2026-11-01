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
      // SEC-10's CPU-time measurement, alone: group order 1 starts after every other project
      // (group 0) has finished, so no other test file competes for the runner's CPUs meanwhile.
      {
        test: {
          name: 'cli-timing',
          root: 'packages/cli',
          include: ['test/**/*.timing.ts'],
          environment: 'node',
          sequence: { groupOrder: 1 },
        },
      },
    ],
    // NF-07 gate: `pnpm test:coverage` runs the core, core-browser, net and relay projects (the
    // relay's tests drive net's RelayClient against the real server) with coverage and fails under
    // these thresholds. Node and Chromium runs of the same file are merged into one report.
    coverage: {
      provider: 'v8',
      // With `--project`, Vitest matches `include` against paths relative to each project's root.
      include: ['src/**'],
      exclude: [
        // Generated data (the SDL controller database as one string), no logic.
        'src/input/gamecontrollerdb.ts',
      ],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      thresholds: {
        // Relative to the repository root.
        'packages/core/src/**': { statements: 80, lines: 80, functions: 80, branches: 80 },
        'packages/net/src/**': { statements: 80, lines: 80, functions: 80, branches: 80 },
      },
    },
  },
});
