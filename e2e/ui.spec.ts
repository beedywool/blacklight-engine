// Phase 2 gate: the Persona-style pause menu of templates/persona-menu, driven only by a simulated
// gamepad; screenshots at 1920×1080 and on a phone.
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Game } from '@blacklight/core';
import { run, serve } from './server';
import { RENDERING_RETRIES } from './tiers';

test.describe.configure({ retries: RENDERING_RETRIES });

const template = resolve(import.meta.dirname, '../templates/persona-menu');
const port = 5197;
const A = 0;
const B = 1;
const RB = 5;
const START = 9;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

let stop: (() => void) | undefined;
test.beforeAll(async () => {
  stop = await serve(template, 'dev', port);
});
test.afterAll(() => stop?.());

/** Replaces the Gamepad API with one standard Xbox pad whose buttons the test sets. */
async function fakeGamepad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = new Array(17).fill(0);
    Object.assign(window, { __pad: buttons });
    navigator.getGamepads = () => [
      {
        index: 0,
        id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
        connected: true,
        mapping: 'standard',
        axes: [0, 0, 0, 0],
        buttons: buttons.map((value: number) => ({
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

/**
 * Presses a pad button for exactly one game step, then releases it. Done inside the page: on a
 * loaded machine a fixed wait between two evaluations can miss every poll (lost press) or span
 * several slow frames (key repeat).
 */
async function press(page: Page, button: number): Promise<void> {
  await page.evaluate(async (b) => {
    const pad = (window as unknown as { __pad: number[] }).__pad;
    const game = window.blacklight;
    const step = game.time.step;
    pad[b] = 1;
    await new Promise<void>((resolve) => {
      let frames = 0;
      // Paused games poll on frames instead of steps: two frames are enough there.
      const wait = () =>
        game.time.step > step || (game.paused && ++frames > 2)
          ? resolve()
          : requestAnimationFrame(wait);
      requestAnimationFrame(wait);
    });
    pad[b] = 0;
  }, button);
  await page.waitForTimeout(100);
}

const focused = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-bl-focused]')?.textContent?.trim() ?? '');

test('the pause menu is fully navigable with a gamepad', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await fakeGamepad(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://localhost:${port}/`);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect.poll(() => focused(page)).toBe('NEW GAME');

  // Title → field.
  await press(page, A);
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'field', { timeout: 10_000 });

  // Start opens the menu; the D-pad moves focus and no longer moves the hero.
  await press(page, START);
  await expect(page.locator('.pause')).toBeVisible();
  await expect.poll(() => focused(page)).toBe('RESUME');
  const heroX = await page.evaluate(() => window.blacklight.scene!.find('Hero')!.x);
  await press(page, DOWN);
  await expect.poll(() => focused(page)).toBe('PARTY');
  expect(await page.evaluate(() => window.blacklight.scene!.find('Hero')!.x)).toBe(heroX);
  await expect(page.locator('.pause__prompts img').first()).toHaveAttribute('src', /xbox_button_a/);
  await press(page, UP);
  await expect.poll(() => focused(page)).toBe('RESUME');
  await expect(page).toHaveScreenshot(['ui', process.platform, 'pause-1080p.png'], {
    maxDiffPixelRatio: 0.02,
  });

  // Settings: sliders, toggles, tabs, selects.
  for (let i = 0; i < 4; i++) await press(page, DOWN);
  await expect.poll(() => focused(page)).toBe('SETTINGS');
  await press(page, A);
  await expect(page.locator('.settings')).toBeVisible();
  await expect.poll(() => focused(page)).toContain('MUSIC');
  const musicBefore = await page.evaluate(() => window.blacklight.audio.volume('music'));
  await press(page, RIGHT);
  await press(page, RIGHT);
  expect(await page.evaluate(() => window.blacklight.audio.volume('music'))).toBeCloseTo(
    Math.min(1, musicBefore + 0.2),
  );
  await press(page, DOWN);
  await press(page, DOWN);
  await expect.poll(() => focused(page)).toContain('SUBTITLES');
  await press(page, A);
  expect(await page.evaluate(() => window.blacklight.settings.get('subtitles'))).toBe(false);

  await press(page, RB);
  await expect.poll(() => focused(page)).toContain('THEME');
  await press(page, RIGHT);
  await expect(page.locator('.bl-ui')).toHaveAttribute('data-theme', 'blacklight');
  await press(page, LEFT);
  await expect(page.locator('.bl-ui')).toHaveAttribute('data-theme', 'persona');

  // Back returns to the menu with the focus where it was.
  await press(page, B);
  await expect(page.locator('.settings')).toHaveCount(0);
  await expect.poll(() => focused(page)).toBe('SETTINGS');

  // Quit asks for confirmation (focus trapped in the dialog), then goes back to the title.
  await press(page, DOWN);
  await press(page, A);
  await expect(page.locator('.bl-dialog')).toBeVisible();
  await expect.poll(() => focused(page)).toBe('Cancel');
  await press(page, DOWN);
  await expect.poll(() => focused(page)).toBe('Cancel');
  await press(page, RIGHT);
  await expect.poll(() => focused(page)).toBe('QUIT');
  await press(page, A);
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'title', { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('the pause menu fits a phone screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 844, height: 390 });
  await fakeGamepad(page);
  await page.goto(`http://localhost:${port}/`);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect.poll(() => focused(page)).toBe('NEW GAME');
  await press(page, A);
  await expect(mount).toHaveAttribute('data-blacklight-scene', 'field', { timeout: 10_000 });
  await press(page, START);
  await expect.poll(() => focused(page)).toBe('RESUME');
  await expect(page).toHaveScreenshot(['ui', process.platform, 'pause-phone.png'], {
    maxDiffPixelRatio: 0.02,
  });
});

declare global {
  interface Window {
    blacklight: Game;
  }
}

test.describe('release build', () => {
  const previewPort = 4197;
  let stopPreview: (() => void) | undefined;
  test.beforeAll(async () => {
    run('pnpm', ['build'], template);
    stopPreview = await serve(template, 'preview', previewPort);
  });
  test.afterAll(() => stopPreview?.());

  test('screens and Kenney prompt glyphs load from the build', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:${previewPort}/`);
    await expect(page.locator('.title')).toBeVisible({ timeout: 30_000 });
    const glyph = page.locator('.title__prompts img');
    await expect(glyph).toHaveAttribute('src', /keyboard_enter-[\w-]+\.svg$/);
    await expect
      .poll(() => glyph.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    expect(errors).toEqual([]);
  });
});
