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
import { RENDERING_RETRIES } from './tiers';

test.describe.configure({ retries: RENDERING_RETRIES });

const require = createRequire(resolve(import.meta.dirname, '../packages/cli/package.json'));
const { PNG } = require('pngjs') as {
  PNG: { sync: { read(data: Buffer): { width: number; height: number; data: Buffer } } };
};

/**
 * Distinct colors of every pixel of a screenshot of the canvas area: a blank or failed game has one or
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

/**
 * The WebGL 2 renderer string of a blank page, or why the browser refused the context (the
 * `webglcontextcreationerror` status message).
 */
async function webgl2(browser: Browser): Promise<{ renderer?: string; error?: string }> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      let error = 'no webglcontextcreationerror message';
      canvas.addEventListener('webglcontextcreationerror', (event) => {
        error = (event as WebGLContextEvent).statusMessage || error;
      });
      const gl = canvas.getContext('webgl2');
      if (!gl) return { error };
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return { renderer };
    });
  } finally {
    await page.close();
  }
}

/**
 * Firefox's driver blocklist refuses WebGL 2 on the Microsoft Basic Render Driver, the only
 * adapter of GitHub's GPU-less Windows runner ("AllowWebgl2:false restricts context creation on
 * this system"). `webgl.force-enabled` lifts the blocklist, and Firefox then draws through ANGLE on
 * Direct3D 11 WARP (software). Players' machines have a real GPU: Firefox keeps its defaults on
 * Linux and macOS, and MANUAL_TESTS.md checks Firefox on a real Windows PC.
 */
function launchOptions(type: BrowserType) {
  return type.name() === 'firefox' && process.platform === 'win32'
    ? { firefoxUserPrefs: { 'webgl.force-enabled': true } }
    : {};
}

async function launch(type: BrowserType): Promise<Browser | string> {
  // Playwright's WebKit for Windows is not Safari and has no Web Audio (`AudioContext` is
  // undefined); Safari's engine is checked on macOS and Linux.
  if (type.name() === 'webkit' && process.platform === 'win32')
    return 'Playwright’s WebKit build for Windows has no Web Audio; WebKit runs on macOS and Linux';
  try {
    // A browser without WebGL 2 is the machine, not the build under test (the 3D template then
    // rightly reports that its KTX2 textures need it): a second browser process gets another
    // chance, and a browser that still has no WebGL 2 fails with the browser's own reason instead
    // of the template's error.
    for (let attempt = 1; ; attempt++) {
      const browser = await type.launch(launchOptions(type));
      const { renderer, error } = await webgl2(browser);
      if (renderer) {
        test
          .info()
          .annotations.push({ type: 'webgl2', description: `${type.name()}: ${renderer}` });
        return browser;
      }
      await browser.close();
      if (attempt === 2)
        throw new Error(
          `${type.name()} started twice without WebGL 2 on this machine (getContext('webgl2') returned null on a blank page: ${error}): the browser cannot run the templates here.`,
        );
      console.log(
        `[browsers] ${type.name()} started without WebGL 2 (${error}); launching it again`,
      );
    }
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
      rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
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
          // A page screenshot clipped to the canvas: an element screenshot first waits for two
          // identical animation frames, which a busy software GPU (Windows runners) never delivered.
          // One screenshot of the party-game's title took 22 s there: room for a few.
          const clip = (await canvas.boundingBox())!;
          await expect
            .poll(async () => colors(await page.screenshot({ clip })), { timeout: 60_000 })
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
