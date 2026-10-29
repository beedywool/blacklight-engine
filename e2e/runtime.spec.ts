// Phase 1 gate: an animated character (.anim.json) moved by a behavior collides with coins and a
// wall and plays a sound; the frame matches the reference screenshot. Then the release build runs.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type * as Core from '@blacklight/core';
import type { Game } from '@blacklight/core';
import { run, serve } from './server';

const fixture = resolve(import.meta.dirname, 'fixtures/runtime');

interface HeroState {
  x: number;
  coins: number;
  animation: string;
  steps: number;
  coinsLeft: number;
  sounds: string[];
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('dev server', () => {
  const port = 5198;
  let stop: (() => void) | undefined;
  test.beforeAll(async () => {
    stop = await serve(fixture, 'dev', port);
  });
  test.afterAll(() => stop?.());

  test('character moves, animates, collides and plays audio', async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    const errors = collectErrors(page);
    await page.goto(`http://localhost:${port}/`);
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
      timeout: 30_000,
    });

    // Step the game by hand so the result does not depend on the machine's frame rate.
    await page.evaluate(() => window.blacklight.pause());
    await page.keyboard.down('ArrowRight');
    const read = (steps: number) =>
      page.evaluate((count): HeroState => {
        const game = window.blacklight;
        game.step(count);
        const hero = game.scene!.find('Hero') as unknown as HeroState;
        return {
          x: hero.x,
          coins: hero.coins,
          animation: hero.animation,
          steps: hero.steps,
          coinsLeft: game.scene!.findAll('Coin').length,
          sounds: game.audio.history,
        };
      }, steps);

    const running = await read(80);
    expect(running.animation).toBe('run');
    expect(running.steps).toBeGreaterThan(4); // "step" frame events from the .anim.json
    expect(running.coins).toBe(3);
    expect(running.coinsLeft).toBe(0);
    expect(running.sounds).toEqual(['coin', 'coin', 'coin']);
    await expect(page.locator('#game canvas')).toHaveScreenshot('runtime-moving.png');

    const blocked = await read(70);
    expect(blocked.x).toBe(235); // stopped by the wall at x 240 (hitbox half-width 5)
    expect(blocked.animation).toBe('idle');
    await page.keyboard.up('ArrowRight');
    expect(errors).toEqual([]);
  });
  test('scenes host scenes, open overlays and switch with transitions', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`http://localhost:${port}/`);
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
      timeout: 30_000,
    });
    const result = await page.evaluate(async () => {
      const game = window.blacklight;
      game.pause();
      const hosted = await game.scene!.hostScene('level', { x: 0, y: 0, width: 160, height: 90 });
      game.step(5);
      const hostedObjects = hosted.objects.length;
      const overlay = await game.overlay('level');
      const pausedBelow = game.scene!.steps;
      game.step(3);
      const stepsWhileOverlay = game.scene!.steps - pausedBelow;
      const overlaySteps = overlay.steps;
      game.closeOverlay();
      await game.goto('level', undefined, { transition: 'fade' });
      return {
        hostedObjects,
        stepsWhileOverlay,
        overlaySteps,
        overlays: game.overlays.length,
        scene: game.scene!.name,
      };
    });
    expect(result).toEqual({
      hostedObjects: 6,
      stepsWhileOverlay: 0,
      overlaySteps: 3,
      overlays: 0,
      scene: 'level',
    });
    expect(errors).toEqual([]);
  });

  test('every object type, split screen and the debug overlay render without errors', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await page.goto(`http://localhost:${port}/`);
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
      timeout: 30_000,
    });
    const counts = await page.evaluate(async () => {
      const core = window.blacklightCore;
      const game = window.blacklight;
      const scene = game.scene!;
      game.pause();
      scene.spawn(core.Text, {
        x: 40,
        y: 20,
        text: 'Hello',
        style: { fill: 0xffffff, fontSize: 12 },
      });
      scene.spawn(core.Text, { x: 40, y: 40, text: 'Bitmap', bitmap: true } as never);
      const sparks = scene.spawn(core.Particles, { x: 100, y: 40 });
      sparks.configure({ rate: 0, speed: [20, 40], tint: [0xffd60a, 0xff5500] });
      sparks.burst(30);
      const map = scene.spawn(core.TilemapLayer, {
        x: 0,
        y: 160,
        map: {
          columns: 4,
          rows: 1,
          tiles: [1, 1, 0, 1],
          solid: true,
          tileset: { image: 'coin', tileWidth: 8, tileHeight: 8 },
        },
      });
      const second = scene.addCamera({ x: 0.5, y: 0, width: 0.5, height: 1 });
      scene.camera.viewport = { x: 0, y: 0, width: 0.5, height: 1 };
      second.zoom = 2;
      game.step(10);
      const solids = map.solidShapes({ x: 0, y: 150, width: 64, height: 20 }).length;
      scene.removeCamera(second);
      scene.camera.viewport = { x: 0, y: 0, width: 1, height: 1 };
      game.step(1);
      return { particles: sparks.count, solids, safe: game.safeArea.width > 0 };
    });
    expect(counts).toEqual({ particles: 30, solids: 3, safe: true });
    await page.keyboard.press('F3');
    await expect(page.locator('pre', { hasText: 'F3 overlay' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('release build', () => {
  const port = 4198;
  let stop: (() => void) | undefined;
  test.beforeAll(async () => {
    run('pnpm', ['build'], fixture);
    stop = await serve(fixture, 'preview', port);
  });
  test.afterAll(() => stop?.());

  test('packs images into an atlas, strips the debug overlay and runs', async ({ page }) => {
    const assets = readdirSync(join(fixture, 'dist/assets'));
    expect(assets.some((file) => /^atlas-0-.*\.png$/.test(file))).toBe(true);
    expect(assets.some((file) => file.startsWith('hero@16x16'))).toBe(false);
    const code = assets
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(fixture, 'dist/assets', f), 'utf8'));
    expect(code.some((source) => source.includes('Debug overlay'))).toBe(false);
    expect(existsSync(join(fixture, 'dist/index.html'))).toBe(true);

    const errors = collectErrors(page);
    await page.goto(`http://localhost:${port}/`);
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
      timeout: 30_000,
    });
    expect(await page.evaluate(() => 'blacklight' in window)).toBe(false);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(500);
    await page.keyboard.up('ArrowRight');
    expect(errors).toEqual([]);
  });
});

declare global {
  interface Window {
    blacklight: Game;
    blacklightCore: typeof Core;
  }
}
