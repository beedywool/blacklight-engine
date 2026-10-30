import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  fullyParallel: false,
  // Specs start their own builds and servers; more workers than this overload busy machines.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  // One reference per screenshot for every OS: scenes in gate tests avoid text, whose rendering differs.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  // Missing references (a new OS in CI) are written and the test passes; CI uploads them.
  updateSnapshots: 'missing',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: 'bench.spec.ts' },
    // NF-01 benchmark: timings need an idle machine, so it runs on its own (`pnpm bench`).
    { name: 'bench', testMatch: 'bench.spec.ts' },
  ],
});
