import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'create', include: ['test/**/*.spec.ts'], environment: 'node' },
});
