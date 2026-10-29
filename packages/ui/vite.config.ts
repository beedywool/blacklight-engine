import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      // The inspector is its own entry: games import it in dev builds only.
      entry: { index: 'src/index.ts', inspector: 'src/inspector.ts' },
      formats: ['es'],
      cssFileName: 'ui',
    },
    target: 'es2023',
    sourcemap: true,
    rolldownOptions: {
      external: ['vue', 'motion', 'inkjs', /^pixi\.js/, /^@blacklight\/core/, /prompt-urls/],
    },
  },
});
