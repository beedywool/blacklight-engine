import { defineConfig } from '@blacklight/core';

// Tooling fixture (TL-02 hot reload e2e, TL-03 VS Code extension tests).
export default defineConfig({
  name: 'Tooling fixture',
  id: 'dev.blacklight.fixture.tooling',
  version: '0.0.0',
  entry: 'arena',
  seed: 'tooling',
  pauseOnBlur: false,
  resolution: { width: 320, height: 180, mode: 'letterbox', pixelArt: true },
  input: {
    actions: {
      fire: ['KeyF', 'Pad:RT'],
    },
  },
});
