import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'cli', include: ['test/**/*.spec.ts'], environment: 'node' },
});
