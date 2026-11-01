// NF-05: the release web build of every template starts and takes input in Chromium, Firefox and
// WebKit (Safari's engine). Each template is created in a temporary folder, so these builds never
// race the specs that build the templates in place. A browser that cannot start on this machine
// (WebKit needs system libraries Playwright installs only on Ubuntu, Debian and macOS) is skipped
// with the reason; CI installs all three.
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chromium,
  expect,
  firefox,
  test,
  webkit,
  type Browser,
  type BrowserType,
} from '@playwright/test';
import { run, serve } from './server';

const require = createRequire(resolve(import.meta.dirname, '../packages/cli/package.json'));
const { PNG } = require('pngjs') as {
  PNG: { sync: { read(data: Buffer): { width: number; height: number; data: Buffer } } };
};

/**
 * Distinct colors of a screenshot of the canvas, every pixel: a blank or failed canvas has one or
 * two. (A coarse grid of samples could miss everything a small first screen draws, depending on
 * where the OS's fonts put the text.)
 */
function colors(image: Buffer): number {
  const png = PNG.sync.read(image);
  const seen = new Set<number>();
  for (let i = 0; i < png.data.length; i += 4)
    seen.add((png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!);
  return seen.size;
}

const repo = resolve(import.meta.dirname, '..');
const templates = readdirSync(join(repo, 'templates')).filter((name) =>
  statSync(join(repo, 'templates', name)).isDirectory(),
);
const BROWSERS: [string, BrowserType][] = [
  ['chromium', chromium],
  ['firefox', firefox],
  ['webkit', webkit],
];

async function launch(type: BrowserType): Promise<Browser | string> {
  try {
    return await type.launch();
  } catch (error) {
    const message = String(error);
    if (/missing dependencies|Executable doesn't exist/i.test(message)) {
      return `${type.name()} cannot start on this machine (run \`pnpm exec playwright install --with-deps ${type.name()}\`): ${message.split('\n')[0]}`;
    }
    throw error;
  }
}

test.describe.configure({ mode: 'parallel' });

templates.forEach((template, index) => {
  test.describe(template, () => {
    const work = mkdtempSync(join(tmpdir(), `blacklight-browsers-${template}-`));
    const game = join(work, 'game');
    let port = 0;
    let stop: (() => void) | undefined;

    test.beforeAll(async () => {
      test.setTimeout(300_000);
      // In parallel mode every worker runs this hook and starts its own server: one port each.
      port = 5480 + index * 2 + test.info().parallelIndex;
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
      run('pnpm', ['install'], game);
      run('pnpm', ['build'], game);
      stop = await serve(game, 'preview', port);
    });

    test.afterAll(() => {
      stop?.();
      rmSync(work, { recursive: true, force: true });
    });

    for (const [name, type] of BROWSERS) {
      test(`${name} runs the release build`, async () => {
        const browser = await launch(type);
        test.skip(typeof browser === 'string', String(browser));
        const page = await (browser as Browser).newPage({
          viewport: { width: 1280, height: 720 },
        });
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        try {
          await page.goto(`http://localhost:${port}/`);
          const mount = page.locator('#game');
          await expect(mount).toHaveAttribute('data-blacklight-state', 'running', {
            timeout: 60_000,
          });
          // The game draws: WebGL works in this browser and the first screen is on it.
          const canvas = page.locator('#game canvas').first();
          await expect(canvas).toBeVisible();
          await expect
            .poll(async () => colors(await canvas.screenshot()), { timeout: 20_000 })
            .toBeGreaterThan(3);
          // Keys and the pointer reach the page without an error, and the game keeps running (Enter
          // may start another scene: the state is empty while it loads).
          for (const key of ['ArrowRight', 'ArrowDown', 'Enter']) await page.keyboard.press(key);
          await page.mouse.click(640, 360);
          await page.waitForTimeout(500);
          await expect(mount).toHaveAttribute('data-blacklight-state', 'running', {
            timeout: 60_000,
          });
          expect(errors).toEqual([]);
        } finally {
          await (browser as Browser).close();
        }
      });
    }
  });
});
