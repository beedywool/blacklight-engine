// Runs the extension's integration tests inside VS Code (@vscode/test-electron) against a copy of
// the tooling fixture game. On Linux without a display it re-runs itself under `xvfb-run`.
//
//   pnpm --filter blacklight-vscode test:integration
//
// VSCODE_EXECUTABLE=/path/to/code uses an installed VS Code instead of downloading one into
// .vscode-test/ (about 150 MB).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTests } from '@vscode/test-electron';

const here = resolve(import.meta.dirname, '..');
const repo = resolve(here, '..', '..');

if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  const result = spawnSync('xvfb-run', ['-a', process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
  });
  if (result.error) {
    console.error('No display: install Xvfb (xvfb-run) to run the VS Code tests headless.');
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

const fixture = join(repo, 'e2e', 'fixtures', 'tooling');
const cli = join(repo, 'packages', 'cli', 'dist', 'cli.js');
for (const [path, hint] of [
  [join(here, 'dist', 'extension.cjs'), 'pnpm --filter blacklight-vscode build'],
  [join(here, 'dist-test', 'suite.cjs'), 'pnpm --filter blacklight-vscode build'],
  [cli, 'pnpm --filter @blacklight/cli build'],
  [join(fixture, 'node_modules'), 'pnpm install'],
]) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}: run \`${hint}\` first.`);
    process.exit(1);
  }
}

// The long spelling of the temporary folder: on the Windows runner tmpdir() is C:\Users\RUNNER~1\…,
// and the dev server started from that spelling could not resolve the fixture's @blacklight/core
// through the node_modules junction.
const work = mkdtempSync(join(realpathSync.native(tmpdir()), 'blacklight-vscode-'));
const workspace = join(work, 'game');
cpSync(fixture, workspace, {
  recursive: true,
  filter: (path) => !/node_modules|\.blacklight|dist/.test(path.slice(fixture.length)),
});
symlinkSync(join(fixture, 'node_modules'), join(workspace, 'node_modules'), 'junction');

let code = 0;
try {
  await runTests({
    ...(process.env.VSCODE_EXECUTABLE && { vscodeExecutablePath: process.env.VSCODE_EXECUTABLE }),
    cachePath: join(here, '.vscode-test'),
    extensionDevelopmentPath: here,
    extensionTestsPath: join(here, 'dist-test', 'suite.cjs'),
    extensionTestsEnv: {
      BLACKLIGHT_VSCODE_TEST: '1',
      BLACKLIGHT_TEST_WORKSPACE: workspace,
      BLACKLIGHT_CLI: cli,
    },
    launchArgs: [
      workspace,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
      '--no-sandbox',
      '--user-data-dir',
      join(work, 'user-data'),
    ],
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  code = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.exit(code);
