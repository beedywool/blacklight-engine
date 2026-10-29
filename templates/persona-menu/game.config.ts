import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: 'Persona Menu',
  id: 'com.example.personamenu',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080, mode: 'extend' },
  ui: { theme: 'persona' },
});
