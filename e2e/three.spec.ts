// Phase 3b gate (templates/2d-with-3d): glTF models drawn between two 2D layers through Pixi's
// WebGL context, a render-to-texture model with a filter and a mask, a model inside a Vue menu,
// Draco + KTX2 decoding offline from the build, and the frame budget of the benchmark scene.
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import type { Game } from '@blacklight/core';
import { run, serve } from './server';

const template = resolve(import.meta.dirname, '../templates/2d-with-3d');
const require = createRequire(resolve(import.meta.dirname, '../packages/cli/package.json'));
const { PNG } = require('pngjs') as {
  PNG: { sync: { read(data: Buffer): { width: number; data: Buffer } } };
};

type Rgb = [number, number, number];

/** Colors of screen points (CSS pixels), from one screenshot. */
async function pixels(page: Page, points: [number, number][]): Promise<Rgb[]> {
  const png = PNG.sync.read(await page.screenshot());
  return points.map(([x, y]) => {
    const i = (Math.round(y) * png.width + Math.round(x)) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  });
}

const near = (a: Rgb, b: Rgb, tolerance = 12) =>
  a.every((v, i) => Math.abs(v - b[i]!) <= tolerance);

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** Script and model files the page loaded so far. */
const resources = (page: Page) =>
  page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));

test.describe('dev server', () => {
  const port = 5322;
  let stop: (() => void) | undefined;
  test.beforeAll(async () => {
    stop = await serve(template, 'dev', port);
  });
  test.afterAll(() => stop?.());

  async function openArena(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`http://localhost:${port}/`);
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'title', {
      timeout: 30_000,
    });
    await page.waitForFunction(() => window.blacklight !== undefined);
    // 3D-01: the title is 2D only; Three.js and the models are not loaded yet.
    const atTitle = await resources(page);
    // (The dev server's asset manifest imports `?url` modules: names only, not the files.)
    expect(atTitle.filter((url) => /three/.test(url) || url.endsWith('.glb'))).toEqual([]);
    await page.keyboard.press('Enter');
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'arena', {
      timeout: 30_000,
    });
    const inArena = await resources(page);
    expect(inArena.some((url) => /\/three\b|three\.js|three_/.test(url))).toBe(true);
    expect(inArena.filter((url) => url.endsWith('.glb')).length).toBe(3);
    // Fixed steps by hand: the frame does not depend on the machine's speed.
    await page.evaluate(() => {
      window.blacklight.pause();
      window.blacklight.step(30);
    });
  }

  test('models are drawn between two 2D layers through the shared context', async ({ page }) => {
    const errors = collectErrors(page);
    await openArena(page);
    const state = await page.evaluate(() => {
      const game = window.blacklight;
      const scene = game.scene!;
      const hero = scene.find('Hero')!;
      const bounds = hero.getBounds();
      const renderer = game.app.renderer as unknown as {
        gl: WebGL2RenderingContext;
        resetState(): void;
      };
      // 3D-02: count how often Pixi gets its state back during one frame.
      let resets = 0;
      const reset = renderer.resetState.bind(renderer);
      renderer.resetState = () => {
        resets++;
        reset();
      };
      game.step(1);
      game.app.render();
      renderer.resetState = reset;
      return {
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        resets,
        glError: renderer.gl.getError(),
        models: scene.objects.filter((o) => 'rotation3d' in o).length,
        layer: hero.parent?.label,
        triangles: (hero as unknown as { loaded: { triangles: number } }).loaded.triangles,
      };
    });
    expect(state.layer).toBe('actors');
    expect(state.triangles).toBeGreaterThan(9500);
    // Hero, guard and crate draw inside Pixi's frame; the portrait draws into its texture first.
    expect(state.models).toBe(4);
    expect(state.resets).toBe(4);
    expect(state.glError).toBe(0);

    // The hero stands across the front pillar (x 560–600): the pillar covers part of the model,
    // the model covers the back layer, and both show in one frame.
    const { bounds } = state;
    const chestY = bounds.y + bounds.height * 0.3;
    const [pillar, chest, sky, grass] = await pixels(page, [
      [580, chestY],
      [bounds.x + bounds.width * 0.6, chestY],
      [700, 100],
      [700, 600],
    ]);
    expect(near(pillar!, [0x7a, 0x7f, 0x8c])).toBe(true);
    expect(near(sky!, [0x1a, 0x2a, 0x4a])).toBe(true);
    expect(near(grass!, [0x2f, 0x5a, 0x3a], 20)).toBe(true);
    // Red chest, lit: neither the pillar nor the sky.
    expect(chest![0]).toBeGreaterThan(chest![1]! + 60);
    await expect(page.locator('#game canvas')).toHaveScreenshot([
      'three',
      process.platform,
      'arena.png',
    ]);
    expect(errors).toEqual([]);
  });

  test('render to texture: a filtered, masked portrait and a model in a Vue menu', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openArena(page);
    const portrait = await page.evaluate(() => {
      const object = window.blacklight.scene!.find('Portrait')!;
      return { filters: object.filters?.length ?? 0, masked: object.mask !== null };
    });
    expect(portrait).toEqual({ filters: 1, masked: true });
    // The ring is centered at (1150, 120): the top of the head, 0.27 units above the texture's
    // center, goes through the sepia filter; below the round mask (radius 74) the texture still
    // holds the robot's hips, but the sky shows.
    const [head, outside] = await pixels(page, [
      [1150, 120 - 0.27 * 220],
      [1150, 208],
    ]);
    expect(head![0]).toBeGreaterThan(head![2]! + 25);
    expect(near(outside!, [0x1a, 0x2a, 0x4a])).toBe(true);

    // The pause menu shows the hero through <ModelView>: rendered to a texture in the game's
    // WebGL context, copied to a canvas, turning while the game is paused.
    await page.evaluate(() => window.blacklight.scene!.ui.push('PauseMenu'));
    const view = page.locator('canvas.bl-model-view');
    await expect(view).toBeVisible();
    const sample = () =>
      view.evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let opaque = 0;
        let hash = 0;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i]! > 0) opaque++;
          hash = (hash * 31 + data[i - 3]!) | 0;
        }
        return { opaque, hash, width: canvas.width };
      });
    await expect
      .poll(async () => (await sample()).opaque, { timeout: 10_000 })
      .toBeGreaterThan(5000);
    const first = await sample();
    expect(first.width).toBe(360);
    expect(await page.evaluate(() => window.blacklight.paused)).toBe(true);
    await expect.poll(async () => (await sample()).hash).not.toBe(first.hash);
    expect(errors).toEqual([]);
  });
});

test.describe('release build', () => {
  const port = 5323;
  let stop: (() => void) | undefined;
  test.beforeAll(async () => {
    run('pnpm', ['build'], template);
    stop = await serve(template, 'preview', port);
  });
  test.afterAll(() => stop?.());

  test('3D loads with the scenes that use it, offline, with bundled decoders', async ({ page }) => {
    const errors = collectErrors(page);
    const base = `http://localhost:${port}/`;
    const outside: string[] = [];
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      outside.push(url);
      return route.abort();
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(base);
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'title', {
      timeout: 30_000,
    });
    const scriptsWithThree = async () => {
      const urls = (await resources(page)).filter((url) => url.endsWith('.js'));
      const found: string[] = [];
      for (const url of urls)
        if ((await (await page.request.get(url)).text()).includes('THREE.WebGLRenderer'))
          found.push(url);
      return found;
    };
    expect(await scriptsWithThree()).toEqual([]);

    await page.keyboard.press('Enter');
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'arena', {
      timeout: 30_000,
    });
    expect((await scriptsWithThree()).length).toBeGreaterThan(0);
    const loaded = await resources(page);
    for (const file of [/hero-[\w-]+\.glb$/, /hero-draco-[\w-]+\.glb$/, /crate-[\w-]+\.glb$/])
      expect(loaded.some((url) => file.test(url))).toBe(true);
    // Draco (guard) and Basis (crate texture) decoders come from the game's own files.
    await expect
      .poll(async () => (await resources(page)).filter((url) => /\.wasm$/.test(url)).length)
      .toBeGreaterThanOrEqual(2);
    const wasm = (await resources(page)).filter((url) => url.endsWith('.wasm'));
    expect(wasm.some((url) => /draco_decoder-/.test(url))).toBe(true);
    expect(wasm.some((url) => /basis_transcoder-/.test(url))).toBe(true);
    expect(outside).toEqual([]);
    const assets = readdirSync(join(template, 'dist/assets'));
    expect(assets.some((file) => /^draco_decoder-.*\.wasm$/.test(file))).toBe(true);
    expect(assets.some((file) => /^basis_transcoder-.*\.wasm$/.test(file))).toBe(true);

    // The crate (KTX2 texture) is drawn: wood colors around its center. The texture transcodes
    // in a worker, so wait for it rather than for a fixed time.
    await expect
      .poll(
        async () => {
          const [wood] = await pixels(page, [[330, 420]]);
          return wood![0]! > 90 && wood![0]! > wood![2]! + 30;
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });

  // Galaxy A54 class: landscape phone viewport and pixel ratio, CPU slowed 4× (Lighthouse's
  // mid-tier mobile). CI has no GPU (SwiftShader draws on the CPU), so the frame rate is only
  // checked on a hardware GPU; the main-thread time per frame is checked everywhere.
  test('benchmark: two animated 10k-triangle models stay within the frame budget', async (// eslint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    const browser = await chromium.launch({
      args: ['--enable-gpu', '--use-angle=vulkan', '--ignore-gpu-blocklist'],
    });
    try {
      const page = await browser.newPage({
        viewport: { width: 915, height: 412 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
      });
      const errors = collectErrors(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const results: Record<string, Record<string, string | undefined>> = {};
      for (const name of ['bench-2d', 'bench']) {
        await page.goto(`http://localhost:${port}/#${name}`);
        await page.reload();
        await expect(page.locator('#game')).toHaveAttribute('data-bench-fps', /\d/, {
          timeout: 60_000,
        });
        results[name] = await page.locator('#game').evaluate((mount: HTMLElement) => ({
          ...mount.dataset,
        }));
      }
      const gpu = await page.evaluate(() => {
        const gl = document.querySelector('#game canvas')!.getContext('webgl2')!;
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      });
      await testInfo.attach('benchmark', {
        body: JSON.stringify({ gpu, ...results }, null, 2),
        contentType: 'application/json',
      });
      const bench = results.bench!;
      const cpu = Number(bench.benchCpuMs);
      const cpuP95 = Number(bench.benchCpuP95Ms);
      const cpu2d = Number(results['bench-2d']!.benchCpuMs);
      if (!/SwiftShader|llvmpipe|Software/i.test(gpu)) {
        // A 60 Hz frame is 16.7 ms; the main thread must leave half of it to the GPU and
        // compositor.
        expect(cpu).toBeLessThan(8.3);
        expect(cpuP95).toBeLessThan(16.7);
        expect(Number(bench.benchFps)).toBeGreaterThanOrEqual(57);
      } else {
        // A software GPU stalls the main thread on its own drawing: on GitHub's runners the scene
        // without the models already takes 5–17 ms, so the budget is checked on a hardware GPU
        // (any developer machine, the phones in MANUAL_TESTS.md). Here the models must not cost
        // more than the rest of the scene: about 1.9× the 2D frame on every runner measured.
        expect(cpu).toBeLessThan(cpu2d * 2.5);
      }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});

declare global {
  interface Window {
    blacklight: Game;
  }
}
