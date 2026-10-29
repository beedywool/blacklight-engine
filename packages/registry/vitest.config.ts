import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'registry', include: ['test/**/*.spec.ts'], environment: 'node' },
});
