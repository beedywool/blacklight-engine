// Regenerates the pictures and terminal output of docs/guide/installation.md and
// getting-started.md (docs/guide/captures/) by running e2e/guide-captures.spec.ts in write mode.
//
//   pnpm build && pnpm docs:screenshots
//
// On Linux without a display it re-runs itself under `xvfb-run`, like the VS Code extension tests.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');

if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  const result = spawnSync('xvfb-run', ['-a', process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
  });
  if (result.error) {
    console.error('No display: install Xvfb (xvfb-run) to take the VS Code pictures headless.');
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '--project=chromium', 'e2e/guide-captures.spec.ts'],
  {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, BLACKLIGHT_WRITE_CAPTURES: '1' },
    shell: process.platform === 'win32',
  },
);
process.exit(result.status ?? 1);
