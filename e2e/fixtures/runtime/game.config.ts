import { defineConfig } from '@blacklight/core';

// Phase 1 gate fixture (e2e/runtime.spec.ts): fixed seed, small pixel-art resolution.
export default defineConfig({
  name: 'Runtime gate',
  id: 'dev.blacklight.fixture.runtime',
  version: '0.0.0',
  entry: 'level',
  seed: 'gate',
  pauseOnBlur: false,
  resolution: { width: 320, height: 180, mode: 'letterbox', pixelArt: true },
});
