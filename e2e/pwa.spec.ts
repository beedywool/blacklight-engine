// PF-01 / PF-06: the web build of a template is an installable Progressive Web App that runs fully
// offline once loaded. Built from the platformer template (images, sounds, a Tiled map, lazy scene
// chunks), served by `blacklight preview`, loaded once, then the browser goes offline and reloads.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const port = 5420;
const url = `http://localhost:${port}/`;
let work: string;
let game: string;
let stop: (() => void) | undefined;

/** Every file of a folder, relative with forward slashes, sorted like the service worker's list. */
function listBuild(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((file) => statSync(join(dir, file)).isFile())
    .map((file) => relative(dir, join(dir, file)).split(sep).join('/'))
    .sort();
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  work = mkdtempSync(join(tmpdir(), 'blacklight-pwa-'));
  run(
    process.execPath,
    [
      join(repo, 'packages/create/dist/index.js'),
      'offline',
      '--template',
      'platformer',
      '--link',
      repo,
    ],
    work,
  );
  game = join(work, 'offline');
  run('pnpm', ['install'], game);
  run('pnpm', ['build'], game);
  stop = await serve(game, 'preview', port);
});

test.afterAll(() => {
  stop?.();
  rmSync(work, { recursive: true, force: true });
});

test('the web build has a manifest from game.config.ts and precaches every file', () => {
  const dist = join(game, 'dist');
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'));
  expect(manifest).toMatchObject({
    id: './?app=com.example.platformer',
    name: 'Platformer',
    start_url: './',
    display: 'fullscreen',
  });
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest" />');
  expect(html).toContain('<title>Platformer</title>');
  const worker = readFileSync(join(dist, 'sw.js'), 'utf8');
  const files = JSON.parse(/const FILES = (\[.*\]);/.exec(worker)![1]!) as string[];
  expect(files).toEqual(['./', ...listBuild(dist).filter((file) => file !== 'sw.js')]);
  expect(files.some((file) => file.endsWith('.wav'))).toBe(true);
  expect(files.some((file) => file.endsWith('.json'))).toBe(true);
});

test('installable, then plays offline after one visit', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });

  // The service worker installs (every file cached) and takes control of the page.
  const cache = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((done) =>
        navigator.serviceWorker.addEventListener('controllerchange', done, { once: true }),
      );
    }
    const keys = await caches.keys();
    const cached = await (await caches.open(keys[0]!)).keys();
    return { keys, count: cached.length };
  });
  expect(cache.keys).toHaveLength(1);
  expect(cache.keys[0]).toMatch(/^blacklight:com\.example\.platformer:[0-9a-f]{16}$/);
  expect(cache.count).toBeGreaterThan(20);

  // Chrome's own installability check: manifest, icons, service worker, secure origin.
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(installabilityErrors).toEqual([]);
  const { url: manifestUrl, errors: manifestErrors } = (await cdp.send('Page.getAppManifest')) as {
    url: string;
    errors: unknown[];
  };
  expect(manifestUrl).toBe(`${url}manifest.webmanifest`);
  expect(manifestErrors).toEqual([]);

  // Offline: reload, start the level (its chunk, tileset, sounds and map come from the cache).
  await context.setOffline(true);
  await page.reload();
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect(page.locator('.title')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'level', { timeout: 10_000 });
  await expect(page.locator('.hud-coins')).toContainText('/ 30');

  // PF-06: a request the cache cannot answer (an online feature) fails with an error the game
  // can catch, the same way it fails without a service worker; the game keeps running.
  const online = await page.evaluate(() =>
    fetch('./api/scores').then(
      () => 'answered',
      (error: unknown) => (error instanceof TypeError ? 'failed' : 'other'),
    ),
  );
  expect(online).toBe('failed');
  await page.waitForTimeout(500);
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running');
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
