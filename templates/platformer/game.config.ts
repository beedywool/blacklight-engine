import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: 'Platformer',
  id: 'com.example.platformer',
  version: '0.1.0',
  entry: 'title',
  // 16 px pixel art drawn three times larger by the level camera; the UI uses the full 1280×720.
  resolution: { width: 1280, height: 720, mode: 'extend', pixelArt: true },
  input: {
    actions: {
      jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW', 'Pad:A'],
    },
  },
});
