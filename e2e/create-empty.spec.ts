// Phase 0 gate: `pnpm create blacklight` → the empty project runs in the browser.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const port = 5199;
let work: string;
let stop: (() => void) | undefined;

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'blacklight-e2e-'));
  run(
    process.execPath,
    [join(repo, 'packages/create/dist/index.js'), 'my-game', '--link', repo],
    work,
  );
  const game = join(work, 'my-game');
  run('pnpm', ['install'], game);
  stop = await serve(game, 'dev', port);
});

test.afterAll(() => {
  stop?.();
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('the empty template runs in the browser', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`http://localhost:${port}/`);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'title');
  await expect(page).toHaveTitle('My Game');

  const canvas = mount.locator('canvas');
  await expect(canvas).toBeVisible();
  // The title text and bulb draw light pixels on the black background. WebGL clears its buffer
  // after each frame, so count them on a screenshot rather than on the canvas.
  await page.waitForTimeout(500);
  const png = (await canvas.screenshot()).toString('base64');
  const lit = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const copy = new OffscreenCanvas(image.width, image.height);
    const context = copy.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 128) count++;
    return count;
  }, png);
  expect(lit).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});
