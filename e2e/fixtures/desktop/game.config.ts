import { defineConfig } from '@blacklight/core';

// Phase 3c gate fixture (e2e/desktop.spec.ts, e2e/security.spec.ts): saves, protected values and
// the desktop app. Release builds turn every security measure on.
export default defineConfig({
  name: 'Desktop Gate',
  id: 'dev.blacklight.fixture.desktop',
  version: '1.0.0',
  entry: 'main',
  pauseOnBlur: false,
  resolution: { width: 640, height: 360, mode: 'letterbox' },
  save: { slots: 3 },
  security: { protect: ['Player.hp', 'save.gold'] },
  window: { minSize: { width: 320, height: 180 } },
  steam: { appId: 480 },
  discord: { appId: '123456789012345678' },
  modules: { echo: { suffix: '!' } },
});
