// templates/party-game: the full local flow with two simulated gamepads (join, pick a mini-game,
// play it to the end, results) for each of the six mini-games, the release build, and an online
// match between two browsers through the relay without desync.
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test, type Page } from '@playwright/test';
import { startRelay, type RelayServer } from '../servers/relay/src/index';
import { run, serve } from './server';

const template = resolve(import.meta.dirname, '../templates/party-game');
const DEV_PORT = 5385;
const PREVIEW_PORT = 5386;
const RELAY_PORT = 5387;

// Standard gamepad buttons.
const A = 0;
const Y = 3;
const UP = 12;
const DOWN = 13;
const RIGHT = 15;

interface PartyWindow {
  __pads: number[][];
  blacklight: {
    time: { step: number; scale: number };
    paused: boolean;
    pause(): void;
    resume(): void;
    step(count: number): void;
    random: { seed(seed: string): void };
    on(name: 'step', listener: () => void): () => void;
    scene: {
      name: string;
      minigame?: {
        referee?: { phase: string; finished: boolean; players: number[] };
        net?: { session: { checksums: Map<number, number>; frame: number } };
        avatarOf(player: number): { x: number; y: number } | undefined;
        findAll(name: string): { x: number; y: number; player: number }[];
        contestants: { player: number }[];
      };
    };
  };
}

/**
 * Time for a scene switch that loads modules and files (the dev server compiles them on first
 * use). On GitHub's Linux runner Chromium draws in software at about one frame per 1.4 s, and each
 * awaited module or file waits for the frame in progress: a match took more than 10 s to start.
 */
const SWITCH = 30_000;

let stop: (() => void) | undefined;
test.beforeAll(async () => {
  stop = await serve(template, 'dev', DEV_PORT);
});
test.afterAll(() => stop?.());

/** Replaces the Gamepad API with `count` standard pads whose buttons the test sets. */
async function fakeGamepads(page: Page, count: number): Promise<void> {
  await page.addInitScript((pads) => {
    const state = Array.from({ length: pads }, () => new Array(17).fill(0));
    Object.assign(window, { __pads: state });
    navigator.getGamepads = () =>
      state.map(
        (buttons, index) =>
          ({
            index,
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
          }) as unknown as Gamepad,
      );
  }, count);
}

/** Presses a button of a pad for exactly one game step (see e2e/ui.spec.ts). */
async function press(page: Page, pad: number, button: number): Promise<void> {
  await page.evaluate(
    async ([p, b]) => {
      const w = window as unknown as PartyWindow;
      const game = w.blacklight;
      const step = game.time.step;
      w.__pads[p]![b] = 1;
      await new Promise<void>((done) => {
        let frames = 0;
        const wait = () =>
          game.time.step > step || (game.paused && ++frames > 2)
            ? done()
            : requestAnimationFrame(wait);
        requestAnimationFrame(wait);
      });
      w.__pads[p]![b] = 0;
    },
    [pad, button] as const,
  );
  await page.waitForTimeout(120);
}

async function hold(page: Page, pad: number, button: number, down: boolean): Promise<void> {
  await page.evaluate(([p, b, v]) => ((window as unknown as PartyWindow).__pads[p]![b] = v), [
    pad,
    button,
    down ? 1 : 0,
  ] as const);
}

const scene = (page: Page) => page.locator('#game');
const focused = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-bl-focused]')?.textContent?.trim() ?? '');

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function open(page: Page, port = DEV_PORT): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`http://localhost:${port}/`);
  await expect(scene(page)).toHaveAttribute('data-blacklight-state', 'running', {
    timeout: 30_000,
  });
  await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'title');
  await expect.poll(() => focused(page)).toContain('LOCAL PARTY');
}

/**
 * Freezes the game for a stable screenshot. One reference per OS: the screens are DOM text in the
 * theme's display font (Impact on Windows and macOS, a fallback on Linux). `banner` hides the
 * mini-game banner, whose animations follow the game's steps, for screens taken at a step the
 * test does not choose (real-time pause, online match).
 */
async function still(page: Page, name: string, options: { banner?: false } = {}): Promise<void> {
  const wasPaused = await page.evaluate(() => {
    const game = (window as unknown as PartyWindow).blacklight;
    const paused = game.paused;
    game.pause();
    return paused;
  });
  const hidden =
    options.banner === false
      ? await page.addStyleTag({ content: '.banner { visibility: hidden }' })
      : undefined;
  await expect(page).toHaveScreenshot(['party-game', process.platform, name], {
    maxDiffPixelRatio: 0.03,
    animations: 'disabled',
    // A new reference takes two page screenshots that must match; on the macOS runner's software
    // GPU one 1920×1080 screenshot of the match took more than the default 5 s.
    timeout: 30_000,
  });
  await hidden?.evaluate((tag) => tag.remove());
  if (!wasPaused) await page.evaluate(() => (window as unknown as PartyWindow).blacklight.resume());
}

/**
 * Presses a button for one step of the paused game. Set and stepped in one go: a paused game
 * still polls the pads every frame for its menus, which would take the press first.
 */
async function tap(page: Page, pad: number, button: number): Promise<void> {
  await page.evaluate(
    ([p, b]) => {
      const w = window as unknown as PartyWindow;
      w.__pads[p]![b] = 1;
      w.blacklight.step(1);
      w.__pads[p]![b] = 0;
      w.blacklight.step(1);
    },
    [pad, button] as const,
  );
}

/** Runs `count` steps of the paused game. */
async function advance(page: Page, count: number): Promise<void> {
  await page.evaluate((n) => (window as unknown as PartyWindow).blacklight.step(n), count);
}

/** Title → join screen: pad 1 is player 1, pad 2 joins as player 2, both get ready. */
async function joinTwoPlayers(page: Page, screenshot = false): Promise<void> {
  await press(page, 0, A);
  await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'player-select');
  await expect(page.locator('.slot--joined')).toHaveCount(1);
  await page.waitForTimeout(500);
  await press(page, 1, A);
  await expect(page.locator('.slot--joined')).toHaveCount(2);
  // Player 2 picks another skin; player 1 cycles its profile and comes back to guest.
  await press(page, 1, DOWN);
  await press(page, 0, RIGHT);
  await expect(page.locator('.slot[data-player="1"] .slot__name')).toContainText('NEW PROFILE');
  await press(page, 0, RIGHT);
  await expect(page.locator('.slot[data-player="1"] .slot__name')).toContainText('GUEST 1');
  if (screenshot) await still(page, 'player-select.png');
  await press(page, 0, A);
  await press(page, 1, A);
  await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'game-select', {
    timeout: SWITCH,
  });
}

/** Moves the focus to a card, sets both settings (RIGHT presses on each) and plays. */
async function pick(page: Page, index: number, settings: [number, number], screenshot = false) {
  await expect.poll(() => focused(page)).toContain('SURVIVAL VS');
  for (let i = 0; i < Math.floor(index / 3); i++) await press(page, 0, DOWN);
  for (let i = 0; i < index % 3; i++) await press(page, 0, RIGHT);
  await press(page, 0, A);
  await expect(page.locator('.details .bl-select').first()).toHaveAttribute('data-bl-focused');
  for (let i = 0; i < settings[0]; i++) await press(page, 0, RIGHT);
  await press(page, 0, DOWN);
  for (let i = 0; i < settings[1]; i++) await press(page, 0, RIGHT);
  if (screenshot) await still(page, 'game-select.png');
  await press(page, 0, DOWN);
  await expect.poll(() => focused(page)).toBe('PLAY!');
  // Matches are not seeded: seed this one, and pause on the mini-game's first step, so the
  // screenshots and the steps the test drives from here see the same match on every run.
  await page.evaluate(() => {
    const game = (window as unknown as PartyWindow).blacklight;
    game.random.seed('e2e');
    const off = game.on('step', () => {
      if (!game.scene?.minigame?.referee?.phase) return;
      off();
      game.pause();
    });
  });
  await press(page, 0, A);
  await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'match', { timeout: SWITCH });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (window as unknown as PartyWindow).blacklight;
        return game.paused ? game.scene.minigame?.referee?.phase : undefined;
      }),
    )
    .toBe('intro');
}

/** Runs the game many steps at a time until the mini-game is finished. */
async function playToEnd(page: Page, maxSteps: number): Promise<number> {
  return page.evaluate(async (max) => {
    const game = (window as unknown as PartyWindow).blacklight;
    let steps = 0;
    while (!game.scene.minigame?.referee?.finished && steps < max) {
      game.step(60);
      steps += 60;
      // Let the UI and the browser breathe between bursts.
      await new Promise((done) => requestAnimationFrame(done));
    }
    return steps;
  }, maxSteps);
}

const MINI_GAMES: {
  scene: string;
  title: string;
  index: number;
  settings: [number, number];
  /** Buttons held on pad 1 and 2 while the game runs. */
  hold?: [number, number];
}[] = [
  // 3 enemies.
  { scene: 'survival-vs', title: 'SURVIVAL VS', index: 0, settings: [1, 1] },
  // First to 3 goals; the mallets move out of their goal mouths.
  { scene: 'air-hockey', title: 'AIR HOCKEY', index: 1, settings: [0, 3], hold: [UP, DOWN] },
  // One life each.
  { scene: 'fifty-fifty', title: '50-50', index: 2, settings: [0, 2] },
  // Fast walls with narrow gaps.
  { scene: 'obstacles', title: 'OBSTACLES', index: 3, settings: [1, 1] },
  // 5 s to hide.
  { scene: 'hide-and-seek', title: 'HIDE AND SEEK', index: 4, settings: [1, 2] },
  // Small ring, 30 s.
  { scene: 'push-push', title: 'PUSH-PUSH', index: 5, settings: [1, 1] },
];

for (const game of MINI_GAMES) {
  test(`local party: ${game.title} with two players, to the results`, async ({ page }) => {
    const first = game.index === 0;
    await fakeGamepads(page, 2);
    const errors = collectErrors(page);
    await open(page);
    if (first) await still(page, 'title.png');
    await joinTwoPlayers(page, first);
    await pick(page, game.index, game.settings, first);
    await expect(page.locator('.banner__title')).toHaveText(game.title);
    await expect(page.locator('.hud .row')).toHaveCount(2);

    // Controls are locked during the banner, then both players move and player 1 plays its card.
    const position = (player: number) =>
      page.evaluate((p) => {
        const avatar = (window as unknown as PartyWindow).blacklight.scene.minigame!.avatarOf(p);
        return avatar && { x: avatar.x, y: avatar.y };
      }, player);
    const before = await position(2);
    await hold(page, 1, RIGHT, true);
    await advance(page, 60);
    expect(await position(2)).toEqual(before);
    await advance(page, 120);
    expect(
      await page.evaluate(
        () => (window as unknown as PartyWindow).blacklight.scene.minigame?.referee?.phase,
      ),
    ).toBe('play');
    await hold(page, 1, RIGHT, false);
    expect((await position(2))?.x).not.toBe(before?.x);
    if (game.scene !== 'hide-and-seek') {
      // The seeker (player 1 here) has no card.
      await tap(page, 0, Y);
      await expect(page.locator('.hud .row[data-player="1"]')).toHaveClass(/row--shield/);
    }
    await still(page, `${game.scene}-play.png`);

    // Fast-forward to the end (the fixed-step simulation runs the same at any speed).
    if (game.hold) {
      await hold(page, 0, game.hold[0], true);
      await hold(page, 1, game.hold[1], true);
    }
    // Matches are not seeded: idle players can take minutes of game time (milliseconds here).
    const steps = await playToEnd(page, 60 * 60 * 10);
    expect(steps).toBeLessThan(60 * 60 * 10);
    if (game.hold) {
      await hold(page, 0, game.hold[0], false);
      await hold(page, 1, game.hold[1], false);
    }
    await page.evaluate(() => (window as unknown as PartyWindow).blacklight.resume());
    await expect(page.locator('.end__panel')).toBeVisible();
    await expect.poll(() => focused(page)).toBe('RESULTS');
    await still(page, `${game.scene}-end.png`);

    await press(page, 0, A);
    await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'results');
    await expect(page.locator('.results__game')).toHaveText(game.title);
    await expect(page.locator('.results__table .line[data-player]')).toHaveCount(2);
    const points = await page
      .locator('.results__table .line[data-player] span:nth-child(2)')
      .allTextContents();
    expect(points.map(Number).some((p) => p > 0)).toBe(true);
    if (first) await still(page, 'results.png');

    // Back to the cards for another round.
    await expect.poll(() => focused(page)).toBe('REPLAY');
    await press(page, 0, RIGHT);
    await press(page, 0, A);
    await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'game-select');
    expect(errors).toEqual([]);
  });
}

test('pause menu stops the mini-game and quits to the cards', async ({ page }) => {
  await fakeGamepads(page, 2);
  const errors = collectErrors(page);
  await open(page);
  await joinTwoPlayers(page);
  await pick(page, 5, [0, 0]);
  await page.evaluate(() => (window as unknown as PartyWindow).blacklight.resume());
  const START = 9;
  await press(page, 1, START);
  await expect(page.locator('.pause')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as PartyWindow).blacklight.paused)).toBe(
    true,
  );
  await expect.poll(() => focused(page)).toBe('RESUME');
  await still(page, 'pause.png', { banner: false });
  for (let i = 0; i < 3; i++) await press(page, 0, DOWN);
  await expect.poll(() => focused(page)).toBe('QUIT TO GAMES');
  await press(page, 0, A);
  await expect(page.locator('.bl-dialog')).toBeVisible();
  await expect.poll(() => focused(page)).toBe('Cancel');
  await press(page, 0, RIGHT);
  await expect.poll(() => focused(page)).toBe('LEAVE');
  await press(page, 0, A);
  await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'game-select');
  expect(await page.evaluate(() => (window as unknown as PartyWindow).blacklight.paused)).toBe(
    false,
  );
  expect(errors).toEqual([]);
});

test.describe('release build', () => {
  let stopPreview: (() => void) | undefined;
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    run('pnpm', ['build'], template);
    stopPreview = await serve(template, 'preview', PREVIEW_PORT);
  });
  test.afterAll(() => stopPreview?.());

  test('the release build starts and reaches the join screen', async ({ page }) => {
    const files = readdirSync(resolve(template, 'dist/assets'));
    expect(files.some((f) => f.endsWith('.svg'))).toBe(true);
    expect(files.some((f) => f.endsWith('.wav'))).toBe(true);
    expect(existsSync(resolve(template, 'dist/index.html'))).toBe(true);
    await fakeGamepads(page, 1);
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`http://localhost:${PREVIEW_PORT}/`);
    await expect(scene(page)).toHaveAttribute('data-blacklight-state', 'running', {
      timeout: 30_000,
    });
    await expect(page.locator('.title__logo')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'player-select', {
      timeout: SWITCH,
    });
    await expect(page.locator('.slot--joined')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

test.describe('online', () => {
  let relay: RelayServer;
  test.beforeAll(async () => {
    relay = await startRelay({ port: RELAY_PORT, host: '127.0.0.1' });
  });
  test.afterAll(() => relay.close());

  test('two browsers play Push-Push online to the end without desync', async () => {
    const browsers = [await chromium.launch(), await chromium.launch()];
    const [host, guest] = await Promise.all(browsers.map((b) => b.newPage()));
    const errors = [...collectErrors(host!), ...collectErrors(guest!)];
    for (const page of [host!, guest!]) {
      await fakeGamepads(page, 1);
      await open(page);
      await page.locator('.title__menu .bl-menu__item', { hasText: 'ONLINE' }).click();
      await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'online');
      await page.locator('.lobby__address input').fill(`127.0.0.1:${RELAY_PORT}`);
    }
    await host!.locator('.lobby__name input').fill('HOST');
    await guest!.locator('.lobby__name input').fill('GUEST');

    // Host: Push-Push (the default), small ring, 30 s.
    await host!.locator('.lobby__host').click();
    const selects = host!.locator('.lobby__panel .bl-select');
    await selects.nth(1).click();
    await selects.nth(2).click();
    await expect(selects.nth(2)).toContainText('30 S');
    await host!.locator('.lobby__create').click();
    const code = (await host!.locator('.lobby__code').textContent())!.trim();
    expect(code).toMatch(/^[A-Z0-9]{4,8}$/);

    await guest!.locator('.lobby__code-input input').fill(code);
    await guest!.locator('.lobby__join-button').click();
    await expect(guest!.locator('.lobby__code')).toHaveText(code);
    await guest!.locator('.lobby__ready').click();
    await expect(host!.locator('.lobby__start')).toBeEnabled();
    await host!.locator('.lobby__start').click();
    for (const page of [host!, guest!]) {
      await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'match', {
        timeout: SWITCH,
      });
      await expect(page.locator('.hud .row')).toHaveCount(2);
    }

    // Both players move and shove; predictions fail often, so rollbacks happen.
    const read = (page: Page) =>
      page.evaluate(() => {
        const minigame = (window as unknown as PartyWindow).blacklight.scene.minigame!;
        return {
          frame: minigame.net!.session.frame,
          checksums: [...minigame.net!.session.checksums],
          phase: minigame.referee!.phase,
        };
      });
    // Inputs change every 0.4 s until the match ends (time limit or ring-out); buttons are
    // released as soon as the mini-game is over, before the end panel shows.
    const buttons = [RIGHT, A, UP, DOWN, A];
    const over = async () =>
      (await Promise.all([host!, guest!].map(read))).some((r) => r.phase === 'over');
    await still(host!, 'online-push-push.png', { banner: false });
    for (let i = 0; !(await over()) && i < 600; i++) {
      if (i % 4 === 0) {
        for (const [k, page] of [host!, guest!].entries()) {
          for (const b of buttons) await hold(page, 0, b, false);
          await hold(page, 0, buttons[(i / 4 + k * 2) % buttons.length]!, true);
        }
      }
      await host!.waitForTimeout(100);
    }
    for (const page of [host!, guest!]) for (const b of buttons) await hold(page, 0, b, false);
    for (const page of [host!, guest!]) {
      await expect(page.locator('.end__panel')).toBeVisible({ timeout: 60_000 });
    }
    const [a, b] = [await read(host!), await read(guest!)];
    const theirs = new Map(b.checksums);
    const common = a.checksums.filter(([frame]) => theirs.has(frame));
    expect(common.length).toBeGreaterThan(10);
    for (const [frame, hash] of common) expect(theirs.get(frame), `step ${frame}`).toBe(hash);
    const scores = await Promise.all(
      [host!, guest!].map((page) => page.locator('.hud .row .row__score').allTextContents()),
    );
    expect(scores[0]).toEqual(scores[1]);
    for (const page of [host!, guest!]) {
      await page.locator('.end__menu .bl-menu__item', { hasText: 'RESULTS' }).click();
      await expect(scene(page)).toHaveAttribute('data-blacklight-scene', 'results');
    }
    expect(errors).toEqual([]);
    for (const browser of browsers) await browser.close();
  });
});
