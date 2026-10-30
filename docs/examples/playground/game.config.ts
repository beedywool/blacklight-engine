import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: 'Playground',
  id: 'dev.blacklight.playground',
  version: '0.1.0',
  entry: 'main',
  resolution: { width: 640, height: 360, mode: 'letterbox', pixelArt: true },
  pauseOnBlur: false,
  input: {
    actions: {
      // Added to the default actions (left, right, up, down, confirm, back, pause…).
      dash: ['ShiftLeft', 'Pad:X'],
    },
  },
});
