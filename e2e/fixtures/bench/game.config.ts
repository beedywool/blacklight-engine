import { defineConfig } from '@blacklight/core';

// NF-01 benchmark fixture (e2e/bench.spec.ts): fixed seed, keeps running in a background tab.
export default defineConfig({
  name: 'Benchmark',
  id: 'dev.blacklight.fixture.bench',
  version: '0.0.0',
  entry: 'bench',
  seed: 'bench',
  pauseOnBlur: false,
  resolution: { width: 1920, height: 1080, mode: 'extend' },
  // Android benchmark (e2e/bench-android.spec.ts) and the reference phones (MANUAL_TESTS.md): the
  // app build runs it full screen in landscape.
  mobile: { orientation: 'landscape', statusBar: 'hidden', keepAwake: true },
});
