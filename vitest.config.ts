import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      '!packages/modules',
      'packages/modules/*',
      'servers/*',
      '!servers/*.yml',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'packages/modules/*/src/**'],
      reporter: ['text', 'html'],
    },
  },
});
