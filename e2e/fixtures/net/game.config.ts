import { defineConfig } from '@blacklight/core';

// Phase 3f gate fixture (e2e/net.spec.ts, packages/net/test/gate.spec.ts): Push-Push online, a
// sumo mini-game in the spirit of NumX, played with rollback.
export default defineConfig({
  name: 'Push-Push online',
  id: 'dev.blacklight.fixture.net',
  version: '0.0.0',
  entry: 'lobby',
  seed: 'net',
  // Two browser windows play against each other in the e2e test; neither may pause.
  pauseOnBlur: false,
  resolution: { width: 640, height: 360, mode: 'letterbox' },
});
