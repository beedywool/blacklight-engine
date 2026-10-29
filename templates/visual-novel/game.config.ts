import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: 'Neon Rain',
  id: 'com.example.neonrain',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080, mode: 'extend' },
  ui: { theme: 'persona' },
  locales: { default: 'en', fallback: 'en' },
});
