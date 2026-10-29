import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'ui' },
    target: 'es2023',
    sourcemap: true,
    rolldownOptions: { external: ['vue', 'motion', /^@blacklight\/core/, /prompt-urls/] },
  },
});
