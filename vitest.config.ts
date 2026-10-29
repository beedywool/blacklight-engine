import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'packages/modules/*', 'servers/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'packages/modules/*/src/**'],
      reporter: ['text', 'html'],
    },
  },
});
