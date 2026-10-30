// SPEC §12 "Getting started": follows docs/guide/getting-started.md step by step. The guide's code
// blocks are imported from docs/examples/getting-started/, the files this test copies, so the page
// and the test cannot drift apart.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Game } from '@blacklight/core';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const guide = join(repo, 'docs/guide/getting-started.md');
const finished = join(repo, 'docs/examples/getting-started');
const port = 5381;
let work: string;
let game: string;
let stop: (() => void) | undefined;

/** Project files of the finished guide (the docs-only tsconfig is not one of them). */
function guideFiles(dir = finished): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return guideFiles(path);
    const file = relative(finished, path).replace(/\\/g, '/');
    return file === 'tsconfig.json' ? [] : [file];
  });
}

test.beforeAll(async () => {
  test.setTimeout(600_000);
  work = mkdtempSync(join(tmpdir(), 'blacklight-guide-'));
  game = join(work, 'my-game');
  // 1. Create the project (the local engine instead of npm versions).
  run(
    process.execPath,
    [join(repo, 'packages/create/dist/index.js'), 'my-game', '--link', repo],
    work,
  );
  run('pnpm', ['install'], game);
  // 2. Add the UI layer.
  run('pnpm', ['add', `@blacklight/ui@link:${join(repo, 'packages/ui')}`, 'vue@3.5.44'], game);
  // 3 to 7. Every file the guide shows.
  for (const file of guideFiles()) cpSync(join(finished, file), join(game, file));
  // 8. Check.
  run('pnpm', ['typecheck'], game);
  stop = await serve(game, 'dev', port);
});

test.afterAll(() => {
  stop?.();
  rmSync(work, { recursive: true, force: true });
});

test('the guide shows every file of the finished project', () => {
  const page = readFileSync(guide, 'utf8');
  const shown = [...page.matchAll(/^<<< @\/examples\/getting-started\/(\S+)$/gm)].map((m) => m[1]);
  const images = [...page.matchAll(/\]\(\.\.\/examples\/getting-started\/(\S+?)\)/g)].map(
    (m) => m[1],
  );
  expect([...shown, ...images].sort()).toEqual(guideFiles().sort());
});

test('title menu, a character moved with the keyboard, and the pause menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`http://localhost:${port}/`);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'title', { timeout: 30_000 });
  await expect(page.locator('.bl-menu__item', { hasText: 'START' })).toBeVisible();

  // Section 6: Enter on START goes to the field.
  await page.keyboard.press('Enter');
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'field', { timeout: 10_000 });
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running');

  // Sections 4 and 5: the hero runs to the right, animated, and idles when released.
  const hero = () =>
    page.evaluate(() => {
      const object = window.blacklight.scene!.find('Hero') as unknown as {
        x: number;
        y: number;
        animation: string;
        flipX: boolean;
      };
      return { x: object.x, y: object.y, animation: object.animation, flipX: object.flipX };
    });
  const start = await hero();
  expect(start.animation).toBe('idle');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  const running = await hero();
  expect(running.animation).toBe('run');
  await page.keyboard.up('ArrowRight');
  expect(running.x).toBeGreaterThan(start.x + 100);
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  const turned = await hero();
  expect(turned.flipX).toBe(true);
  expect(turned.y).toBeLessThan(start.y);
  await expect.poll(async () => (await hero()).animation).toBe('idle');

  // Section 7: Escape opens the pause menu; game input is blocked under it.
  await page.keyboard.press('Escape');
  await expect(page.locator('.bl-menu__item', { hasText: 'RESUME' })).toBeVisible();
  const paused = await hero();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  expect((await hero()).x).toBe(paused.x);

  // RESUME closes it, TITLE goes back to the title scene.
  await page.keyboard.press('Enter');
  await expect(page.locator('.bl-menu__item', { hasText: 'RESUME' })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.bl-menu__item', { hasText: 'TITLE' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'title', { timeout: 10_000 });

  expect(errors).toEqual([]);
});

declare global {
  interface Window {
    blacklight: Game;
  }
}
