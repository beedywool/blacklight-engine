import { playwright } from '@vitest/browser-playwright';
import { defineProject } from 'vitest/config';

// Unit tests of code that needs a real browser: WebGL rendering through Pixi, the DOM, canvas,
// Web Audio, the Gamepad API and the requestAnimationFrame loop. Headless Chromium through
// Playwright; v8 coverage of these runs merges with the Node project's (`pnpm test:coverage`).
export default defineProject({
  test: {
    name: 'core-browser',
    include: ['test/browser/**/*.spec.ts'],
    browser: {
      enabled: true,
      headless: true,
      // Browsers keep an AudioContext suspended until a user gesture; tests have none to give,
      // so the policy is lifted (the unlock-on-gesture path is tested with synthetic events).
      provider: playwright({
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      }),
      instances: [{ browser: 'chromium' }],
      viewport: { width: 800, height: 600 },
    },
  },
});
