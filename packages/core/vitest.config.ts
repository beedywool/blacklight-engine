import { defineProject } from 'vitest/config';

export default defineProject({
  // test/browser/ runs in Chromium (vitest.browser.config.ts).
  test: { name: 'core', include: ['test/**/*.spec.ts'], exclude: ['test/browser/**'] },
});
