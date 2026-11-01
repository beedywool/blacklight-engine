// Phase 3g: hot reload keeps the game's state (TL-02) and the dev-only debug channel answers
// tools such as the VS Code extension (TL-03). The fixture is copied to a temporary folder so the
// test can edit its files.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Game } from '@blacklight/core';
import { serve } from './server';

const fixture = resolve(import.meta.dirname, 'fixtures/tooling');
const port = 5370;
let root: string;
let stop: (() => void) | undefined;

declare global {
  interface Window {
    blacklight: Game;
    marker?: number;
  }
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'blacklight-tooling-'));
  cpSync(fixture, root, {
    recursive: true,
    filter: (path) => !/node_modules|\.blacklight|dist/.test(path.slice(fixture.length)),
  });
  symlinkSync(join(fixture, 'node_modules'), join(root, 'node_modules'), 'junction');
  stop = await serve(root, 'dev', port);
});
test.afterAll(() => {
  stop?.();
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

function edit(path: string, from: string, to: string): void {
  const file = join(root, path);
  const text = readFileSync(file, 'utf8');
  if (!text.includes(from)) throw new Error(`${path} does not contain ${from}`);
  writeFileSync(file, text.replace(from, to));
}

async function start(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
    timeout: 30_000,
  });
  return errors;
}

test('hot reload keeps the state of scenes, objects and screens', async ({ page }) => {
  const errors = await start(page);
  await page.evaluate(() => {
    window.blacklight.pause();
    window.marker = 1;
  });
  await page.keyboard.down('ArrowRight');
  await page.evaluate(() => window.blacklight.step(30));
  await page.keyboard.up('ArrowRight');
  const read = () =>
    page.evaluate(() => {
      const scene = window.blacklight.scene as unknown as {
        ticks: number;
        rate(): number;
        hero: { x: number; hp: number; greeting(): string };
        findAll(name: string): unknown[];
      };
      return {
        x: scene.hero.x,
        hp: scene.hero.hp,
        ticks: scene.ticks,
        rate: scene.rate(),
        greeting: scene.hero.greeting(),
        coins: scene.findAll('Coin').length,
        sameHero: scene.hero === (window as unknown as { hero?: unknown }).hero,
        marker: window.marker,
      };
    });
  await page.evaluate(() => {
    const scene = window.blacklight.scene!;
    scene.find('first')!.destroy();
    (scene.find('Hero') as unknown as { hp: number }).hp = 2;
  });
  const before = await read();
  // `ticks` counts every step since create(), including those before the test paused the game.
  expect(before).toMatchObject({ x: 105, rate: 1, coins: 1, hp: 2 });

  // Scene module: rebuilt from the new class, state restored.
  edit('scenes/arena/arena.scene.ts', 'return 1;', 'return 100;');
  await expect.poll(async () => (await read()).rate, { timeout: 15_000 }).toBe(100);
  const afterScene = await read();
  expect(afterScene).toMatchObject({ x: 105, ticks: before.ticks, coins: 1, hp: 2, marker: 1 });
  await page.evaluate(() => window.blacklight.step(1));
  expect((await read()).ticks).toBe(before.ticks + 100);

  // Object module: live instance patched, same object, same position.
  await page.evaluate(() => {
    (window as unknown as { hero: unknown }).hero = window.blacklight.scene!.find('Hero');
  });
  edit('objects/hero/hero.object.ts', "return 'hello';", "return 'hi';");
  await expect.poll(async () => (await read()).greeting, { timeout: 15_000 }).toBe('hi');
  expect(await read()).toMatchObject({ x: 105, hp: 2, sameHero: true, marker: 1 });

  // Vue screen: @vitejs/plugin-vue swaps the component, the page is not reloaded.
  await page.evaluate(() => window.blacklight.scene!.ui.push('Menu'));
  await expect(page.locator('.menu__title')).toHaveText('Paused');
  edit('ui/Menu.vue', '>Paused<', '>Pause menu<');
  await expect(page.locator('.menu__title')).toHaveText('Pause menu', { timeout: 15_000 });
  expect((await read()).marker).toBe(1);
  expect(errors).toEqual([]);
});

interface Response {
  kind: string;
  id?: string;
  client?: string;
  result?: unknown;
  error?: string;
}

/** A tool client on the dev server's WebSocket, like the VS Code extension. */
async function connect(): Promise<{
  call(method: string, params?: Record<string, unknown>): Promise<Response>;
  close(): void;
}> {
  const info = JSON.parse(readFileSync(join(root, '.blacklight/dev-server.json'), 'utf8')) as {
    port: number;
    token: string;
  };
  expect(info.port).toBe(port);
  const socket = new WebSocket(`ws://localhost:${info.port}/?token=${info.token}`, 'vite-hmr');
  const messages: Response[] = [];
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data)) as {
      type: string;
      event?: string;
      data?: Response;
    };
    if (payload.type === 'custom' && payload.event === 'blacklight:debug')
      messages.push(payload.data!);
  });
  await new Promise((ready) => socket.addEventListener('open', ready));
  let next = 0;
  return {
    async call(method, params) {
      const id = `t${next++}`;
      socket.send(
        JSON.stringify({
          type: 'custom',
          event: 'blacklight:debug',
          data: { kind: 'request', id, method, params },
        }),
      );
      await expect
        .poll(() => messages.some((m) => m.kind === 'response' && m.id === id))
        .toBe(true);
      return messages.find((m) => m.kind === 'response' && m.id === id)!;
    },
    close: () => socket.close(),
  };
}

test('the debug channel lists objects, edits variables and previews UI focus states', async ({
  page,
}) => {
  const errors = await start(page);
  await page.evaluate(() => window.blacklight.pause());
  const tool = await connect();
  const list = (await tool.call('objects')).result as { objects: { id: number; type: string }[] };
  const hero = list.objects.find((o) => o.type === 'Hero')!;
  expect(list.objects.map((o) => o.type).sort()).toEqual(['Coin', 'Coin', 'Hero']);
  const inspected = (await tool.call('inspect', { id: hero.id })).result as {
    data: { hp: number };
  };
  expect(inspected.data.hp).toBe(3);
  await tool.call('set', { id: hero.id, path: 'hp', value: 7 });
  await tool.call('set', { id: hero.id, path: 'core.x', value: 150 });
  expect(
    await page.evaluate(() => {
      const h = window.blacklight.scene!.find('Hero') as unknown as { hp: number; x: number };
      return [h.hp, h.x];
    }),
  ).toEqual([7, 150]);

  await tool.call('ui.open', { screen: 'Menu' });
  await expect(page.locator('.menu__title')).toBeVisible();
  const focusables = (await tool.call('ui.focusables')).result as {
    label: string;
    focused: boolean;
  }[];
  expect(focusables.map((f) => f.label)).toEqual(['Resume', 'Options', 'Quit']);
  await tool.call('ui.focus', { index: 2 });
  await expect(page.locator('[data-bl-focused]')).toHaveText('Quit');

  const timeline = await tool.call('ui.timeline', {
    timeline: { steps: [{ to: '.menu__title', keyframes: { opacity: [0, 0.5] }, duration: 0.05 }] },
  });
  expect(timeline.error).toBeUndefined();
  await expect(page.locator('.menu__title')).toHaveCSS('opacity', '0.5');
  tool.close();
  expect(errors).toEqual([]);
});
