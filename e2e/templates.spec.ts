// DOC-05 / DOC-06: every folder of templates/ is created with create-blacklight, runs with
// `blacklight dev`, and builds for every target without a change: web (PWA), the desktop target of
// this OS (unpacked app: packaging the installers runs in CI's desktop jobs), Steam (that app with
// steamworks.js and the depot scripts), and the Android and iOS projects (generated and synced;
// the native compilers run in CI's android and ios jobs).
// New templates are picked up from the folder list.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const templates = readdirSync(join(repo, 'templates')).filter((name) =>
  statSync(join(repo, 'templates', name)).isDirectory(),
);
const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';

test.describe.configure({ mode: 'parallel' });

test('the scaffolder offers every template', () => {
  const help = spawnSync(
    process.execPath,
    [join(repo, 'packages/create/dist/index.js'), '--help'],
    {
      encoding: 'utf8',
    },
  ).stdout;
  expect(help).toContain(`Templates: ${[...templates].sort().join(', ')}`);
  for (const name of ['empty', 'persona-menu', 'visual-novel', 'platformer', '2d-with-3d'])
    expect(templates).toContain(name);
});

templates.forEach((template, index) => {
  test(`${template}: dev, then web, ${os}, steam, android and ios builds`, async ({ page }) => {
    test.setTimeout(900_000);
    const work = mkdtempSync(join(tmpdir(), `blacklight-template-${template}-`));
    const game = join(work, 'game');
    const port = 5460 + index;
    try {
      run(
        process.execPath,
        [
          join(repo, 'packages/create/dist/index.js'),
          'game',
          '--template',
          template,
          '--link',
          repo,
        ],
        work,
      );
      expect(existsSync(join(game, '.github/workflows/build.yml'))).toBe(true);
      run('pnpm', ['install'], game);

      // blacklight dev: the entry scene starts without errors.
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const stop = await serve(game, 'dev', port);
      try {
        await page.goto(`http://localhost:${port}/`);
        await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
          timeout: 60_000,
        });
      } finally {
        stop();
      }
      expect(errors).toEqual([]);

      const build = (...args: string[]) =>
        run('pnpm', ['exec', 'blacklight', 'build', '--target', ...args], game);
      build('web');
      expect(existsSync(join(game, 'dist/sw.js'))).toBe(true);

      build(os, '--dir', ...(os === 'mac' ? ['--arch', process.arch] : []));
      expect(
        readdirSync(join(game, 'release', os)).some(
          (name) => name.includes('unpacked') || name.startsWith('mac'),
        ),
      ).toBe(true);
      // Electron apps are large: free the space before the next build.
      rmSync(join(game, 'release'), { recursive: true, force: true });

      // Steam: the same app with steamworks.js, staged as this OS's depot, and the upload scripts.
      build('steam');
      const steam = join(game, 'release', 'steam');
      expect(existsSync(join(steam, 'content', os))).toBe(true);
      expect(readdirSync(join(steam, 'content', os)).length).toBeGreaterThan(0);
      expect(existsSync(join(steam, 'scripts', 'app_build_480.vdf'))).toBe(true);
      rmSync(join(game, 'release'), { recursive: true, force: true });

      build('android', '--dry-run');
      expect(
        existsSync(join(game, '.blacklight/mobile/android/app/src/main/assets/public/index.html')),
      ).toBe(true);
      build('ios', '--dry-run');
      expect(existsSync(join(game, '.blacklight/mobile/ios/App/App.xcodeproj'))).toBe(true);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
