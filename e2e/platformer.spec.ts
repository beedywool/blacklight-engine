// DOC-05: the platformer template, created with create-blacklight. Keyboard, a simulated gamepad and
// touch controls move the hero; it collects coins, raises the checkpoint, squashes a slime, comes
// back after a hit and reaches the goal. The level matches its screenshot; the release build runs.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Game } from '@blacklight/core';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const devPort = 5410;
const previewPort = 5411;
const A = 0;
const RIGHT = 15;
let work: string;
let game: string;
let stop: (() => void) | undefined;

interface HeroState {
  x: number;
  y: number;
  animation: string;
  coins: number;
  onGround: boolean;
  visible: boolean;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'blacklight-platformer-'));
  run(
    process.execPath,
    [
      join(repo, 'packages/create/dist/index.js'),
      'jumper',
      '--template',
      'platformer',
      '--link',
      repo,
    ],
    work,
  );
  game = join(work, 'jumper');
  run('pnpm', ['install'], game);
  stop = await serve(game, 'dev', devPort);
});

test.afterAll(() => {
  stop?.();
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** A standard Xbox pad whose buttons and axes the test sets through `window.__pad`. */
async function fakeGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pad = { buttons: new Array(17).fill(0), axes: [0, 0, 0, 0] };
    Object.assign(window, { __pad: pad });
    navigator.getGamepads = () => [
      {
        index: 0,
        id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
        connected: true,
        mapping: 'standard',
        axes: [...pad.axes],
        buttons: pad.buttons.map((value: number) => ({
          value,
          pressed: value > 0.5,
          touched: value > 0,
        })),
        timestamp: performance.now(),
        vibrationActuator: null,
      } as unknown as Gamepad,
    ];
  });
}

/** Title → level, then the loop is paused: the test steps it by hand (frame-rate independent). */
async function startLevel(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`http://localhost:${devPort}/`);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'title');
  await expect(page.locator('.title')).toBeVisible();
  await page.keyboard.press('Enter');
  // The dev server compiles the level's modules and the HUD's Vue files on their first request:
  // up to 27 s on the Windows runner.
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'level', { timeout: 30_000 });
  await expect(page.locator('.hud-coins')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => window.blacklight.pause());
}

/**
 * Applies input changes, runs `count` steps, then reads the hero. The game is paused, and a paused
 * game still polls input on display frames: a press must happen in the same task as the steps, or
 * a frame consumes it. Keys go through real DOM keyboard events; pad values through the fake pad.
 */
function step(
  page: Page,
  count: number,
  input: { down?: string[]; up?: string[]; pad?: Record<number, number>; axis?: number } = {},
): Promise<HeroState> {
  return page.evaluate(
    ({ n, down = [], up = [], pad = {}, axis }): HeroState => {
      for (const code of down) window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      for (const code of up) window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      const fake = (window as unknown as { __pad?: { buttons: number[]; axes: number[] } }).__pad;
      for (const [button, value] of Object.entries(pad)) fake!.buttons[Number(button)] = value;
      if (axis !== undefined) fake!.axes[0] = axis;
      const game = window.blacklight;
      game.step(n);
      const hero = game.scene!.find('Hero') as unknown as HeroState & {
        platformer: { onGround: boolean };
      };
      return {
        x: hero.x,
        y: hero.y,
        animation: hero.animation,
        coins: Number(document.querySelector('.hud-coins')?.textContent?.match(/\d+/)?.[0]),
        onGround: hero.platformer.onGround,
        visible: hero.visible,
      };
    },
    { n: count, ...input },
  );
}

const teleport = (page: Page, x: number, y: number) =>
  page.evaluate(([tx, ty]) => window.blacklight.scene!.find('Hero')!.teleport(tx!, ty!), [x, y]);

test('keyboard: run, jump, collect coins, checkpoint, slime, goal', async ({ page }) => {
  const errors = collectErrors(page);
  await startLevel(page);
  const start = await step(page, 2);
  expect(start).toMatchObject({ x: 56, y: 208, onGround: true, animation: 'idle', coins: 0 });

  // Three coins sit on the ground ahead of the start.
  await page.keyboard.down('ArrowRight');
  const running = await step(page, 60);
  expect(running.x).toBeGreaterThan(150);
  expect(running.animation).toBe('run');
  await page.keyboard.up('ArrowRight');
  await expect(page.locator('.hud-coins')).toContainText('3');

  // Jump: up while Space is held, then back on the ground.
  const jumping = await step(page, 12, { down: ['Space'] });
  expect(jumping.y).toBeLessThan(start.y - 20);
  expect(jumping.animation).toBe('jump');
  expect(await step(page, 90, { up: ['Space'] })).toMatchObject({ y: 208, onGround: true });

  // Checkpoint at tile 56: walking through raises it.
  await teleport(page, 56 * 16 - 30, 208);
  await page.keyboard.down('ArrowRight');
  await step(page, 30);
  await page.keyboard.up('ArrowRight');
  expect(
    await page.evaluate(
      () =>
        (window.blacklight.scene!.find('Checkpoint') as unknown as { animation: string }).animation,
    ),
  ).toBe('up');

  // A slime walking into the hero sends it back to the checkpoint, blinking.
  const hit = await page.evaluate(() => {
    const scene = window.blacklight.scene!;
    const slime = scene.findAll('Slime')[1]!;
    const hero = scene.find('Hero')!;
    hero.teleport(slime.x, slime.y);
    window.blacklight.step(2);
    return { x: hero.x, y: hero.y };
  });
  expect(hit).toEqual({ x: 56 * 16 + 8, y: 208 });

  // Landing on a slime squashes it and bounces the hero.
  const stomp = await page.evaluate(() => {
    const scene = window.blacklight.scene!;
    const before = scene.findAll('Slime').length;
    const slime = scene.findAll('Slime')[2]!;
    const hero = scene.find('Hero')!;
    window.blacklight.step(80); // blinking over
    hero.teleport(slime.x, slime.y - 40);
    for (let i = 0; i < 40 && hero.velocity.y >= 0; i++) window.blacklight.step(1);
    window.blacklight.step(40);
    return { before, after: scene.findAll('Slime').length };
  });
  expect(stomp.after).toBe(stomp.before - 1);

  // The goal ends the level.
  await teleport(page, 115 * 16 - 40, 208);
  await page.keyboard.down('ArrowRight');
  await step(page, 40);
  await page.keyboard.up('ArrowRight');
  // Clear.vue's first request is compiled then, like the HUD's (seconds on the Windows runner).
  await expect(page.locator('.clear')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.clear')).toContainText('LEVEL CLEAR');
  expect(errors).toEqual([]);
});

test('gamepad: D-pad runs, A jumps, prompts show pad buttons', async ({ page }) => {
  const errors = collectErrors(page);
  await fakeGamepad(page);
  await startLevel(page);
  const start = await step(page, 2);
  const moved = await step(page, 30, { pad: { [RIGHT]: 1 } });
  expect(moved.x).toBeGreaterThan(start.x + 30);
  const jumped = await step(page, 10, { pad: { [RIGHT]: 0, [A]: 1 } });
  expect(jumped.y).toBeLessThan(start.y - 15);
  await step(page, 90, { pad: { [A]: 0 } });
  // The left stick works too.
  const stick = await step(page, 20, { axis: 1 });
  expect(stick.x).toBeGreaterThan(jumped.x + 20);
  // Glyphs follow the last device: the HUD shows the pad's A button for jump.
  await expect(page.locator('.hud-prompts img').first()).toHaveAttribute('src', /xbox_button_a/);
  expect(errors).toEqual([]);
});

test('touch: virtual joystick and jump button', async ({ page }) => {
  const errors = collectErrors(page);
  await startLevel(page);
  const start = await step(page, 2);
  const touch = (kind: 'down' | 'move' | 'up', id: number, x: number, y: number) =>
    page.evaluate(
      ([k, i, px, py]) => {
        const input = window.blacklight.input;
        const at = { x: px as number, y: py as number };
        if (k === 'down') input.pointerDown(i as number, 'touch', 0, at);
        else if (k === 'move') input.pointerMove(i as number, 'touch', at);
        else input.pointerUp(i as number, 'touch', 0, at);
      },
      [kind, id, x, y] as const,
    );
  // Thumb down on the left half, slid right: the joystick pushes `right`.
  await touch('down', 1, 200, 500);
  await step(page, 1);
  await touch('move', 1, 300, 500);
  const moved = await step(page, 30);
  expect(moved.x).toBeGreaterThan(start.x + 30);
  expect(await page.evaluate(() => window.blacklight.scene!.find('TouchControls')!.visible)).toBe(
    true,
  );
  // Second finger on the jump button (bottom right).
  await touch('down', 2, 1150, 590);
  const jumped = await step(page, 10);
  expect(jumped.y).toBeLessThan(start.y - 15);
  await touch('up', 2, 1150, 590);
  await touch('up', 1, 300, 500);
  expect(errors).toEqual([]);
});

test('pause menu and level screenshot', async ({ page }) => {
  const errors = collectErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startLevel(page);
  await page.keyboard.down('ArrowRight');
  await step(page, 45);
  await page.keyboard.up('ArrowRight');
  await step(page, 30);
  // Text renders differently on each OS: compare the game only.
  await page.addStyleTag({ content: '.hud-coins, .hud-prompts { visibility: hidden }' });
  await expect(page.locator('#game canvas')).toHaveScreenshot('platformer-level.png');

  await page.evaluate(() => window.blacklight.resume());
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause')).toBeVisible();
  expect(await page.evaluate(() => window.blacklight.paused)).toBe(true);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'title', {
    timeout: 10_000,
  });
  expect(errors).toEqual([]);
});

test('release build runs', async ({ page }) => {
  test.setTimeout(300_000);
  run('pnpm', ['build'], game);
  const stopPreview = await serve(game, 'preview', previewPort);
  try {
    const errors = collectErrors(page);
    await page.goto(`http://localhost:${previewPort}/`);
    const mount = page.locator('#game');
    await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
    await expect(page.locator('.title')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(mount).toHaveAttribute('data-blacklight-scene', 'level', { timeout: 10_000 });
    await expect(page.locator('.hud-coins')).toContainText('/ 30');
    expect(errors).toEqual([]);
  } finally {
    stopPreview();
  }
});

declare global {
  interface Window {
    blacklight: Game;
  }
}
