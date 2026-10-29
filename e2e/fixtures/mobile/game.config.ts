import { defineConfig } from '@blacklight/core';

// Phase 3d gate fixture (e2e/mobile*.spec.ts): taps, the back action and a save that survives an
// app restart, reported on the mount element so tests read them from outside the game.
export default defineConfig({
  name: 'Mobile Gate',
  id: 'dev.blacklight.fixture.mobile',
  version: '1.2.3',
  entry: 'play',
  resolution: { width: 1280, height: 720, mode: 'extend' },
  mobile: { orientation: 'landscape', statusBar: 'hidden', keepAwake: true },
});
