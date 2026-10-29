import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: 'My Game',
  id: 'com.example.mygame',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080, mode: 'extend' },
});
