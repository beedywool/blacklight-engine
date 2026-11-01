// Phase 3a gate: templates/visual-novel. An Ink dialogue with choices, scene and screen
// transitions, the FX layer (shaders on the game and on a DOM component), Japanese and Arabic
// text, and a video cutscene with subtitles — plus world-anchored UI, the inspector, saves and the
// release build (Ink compiled, no story source shipped).
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Game } from '@blacklight/core';
import type { UiRuntime } from '@blacklight/ui';
import { run, serve } from './server';

const template = resolve(import.meta.dirname, '../templates/visual-novel');
const port = 5310;
const previewPort = 5311;

declare global {
  interface Window {
    blacklight: Game;
  }
}

let stop: (() => void) | undefined;
test.beforeAll(async () => {
  stop = await serve(template, 'dev', port);
});
test.afterAll(() => stop?.());

async function open(page: Page, errors: string[]): Promise<void> {
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`http://localhost:${port}/`);
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
    timeout: 30_000,
  });
  await expect(page.locator('.title')).toBeVisible();
}

const ui = (page: Page) =>
  page.evaluate(() => (window.blacklight.ui as UiRuntime).i18n.locale.value);
const dialogueText = (page: Page) =>
  page.evaluate(() => {
    const scene = window.blacklight.scene as unknown as {
      dialogue?: { line: { text: string } | null };
    };
    return scene.dialogue?.line?.text ?? '';
  });

/** Finishes the typing line if needed, then shows the next one. */
async function nextLine(page: Page): Promise<void> {
  // One click either finishes the typing line or shows the next one; click until the line changes
  // (a cover or a slow machine can make the typing state change between a check and a click).
  const box = page.locator('.bl-dialogue__box');
  const before = await dialogueText(page);
  await expect
    .poll(
      async () => {
        await box.click();
        return dialogueText(page);
      },
      { intervals: [250], timeout: 15_000 },
    )
    .not.toBe(before);
}

/** Presses confirm until the dialogue offers choices (finishing each line first). */
async function advanceToChoices(page: Page): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if ((await page.locator('.bl-dialogue__choice').count()) > 0) return;
    await page.locator('.bl-dialogue__box').click();
    await page.waitForTimeout(120);
  }
  throw new Error('No choices appeared');
}

test('title: FX layer on the game and on a DOM component, world-anchored UI, inspector', async ({
  page,
}) => {
  const errors: string[] = [];
  await open(page, errors);

  // The title screen adds a halftone shader to the game canvas while it is open (useFx).
  await expect
    .poll(() => page.evaluate(() => (window.blacklight.world.filters ?? []).length))
    .toBe(1);
  // <PixiRender> draws the logo into the FX canvas above the UI, through a glitch shader.
  await expect(page.locator('[data-bl-pixi-render]')).toHaveAttribute(
    'data-bl-pixi-render',
    'rendered',
  );
  await expect(page.locator('.bl-fx-overlay')).toHaveCount(1);
  const drawn = await page.evaluate(async () => {
    const overlay = await (window.blacklight.ui as UiRuntime).fx.overlay();
    const { pixels } = overlay.app.renderer.extract.pixels(overlay.stage);
    let opaque = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) opaque++;
    return opaque;
  });
  expect(drawn).toBeGreaterThan(5000);
  expect(await page.locator('.title__logo').evaluate((el) => getComputedStyle(el).opacity)).toBe(
    '0',
  );

  // A tag follows the bobbing lantern; clicking the lantern floats a number above it.
  const tag = page.locator('.bl-world-anchor');
  await expect(tag).toBeVisible();
  const before = await tag.boundingBox();
  await page.waitForTimeout(400);
  const after = await tag.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThan(0.5);
  const lantern = await page.evaluate(() => {
    const object = window.blacklight.scene!.objects.find((o) => o.objectName === 'Lantern')!;
    const point = object.getGlobalPosition();
    const canvas = window.blacklight.app.canvas.getBoundingClientRect();
    return { x: canvas.left + point.x, y: canvas.top + point.y };
  });
  await page.mouse.click(lantern.x, lantern.y);
  await expect(page.locator('.bl-float')).toHaveText('+1');

  // Dev inspector: F9 shows the hovered component and the focus.
  await page.keyboard.press('F9');
  await page.locator('.bl-menu__item').nth(2).hover();
  await expect(page.locator('.bl-inspector__name')).toContainText('MenuList');
  await expect(page.locator('.bl-inspector__focus')).toContainText('GALLERY');
  await page.keyboard.press('F9');
  await expect(page.locator('.bl-inspector')).toBeHidden();
  expect(errors).toEqual([]);
});

test('new game: IME name, cutscene with subtitles, iris transition, Ink dialogue with choices, FX, backlog, saves', async ({
  page,
}) => {
  const errors: string[] = [];
  await open(page, errors);

  // Name entry with IME composition (Japanese input), committed on composition end.
  await page.keyboard.press('Enter');
  const field = page.locator('.bl-text-input__field');
  await expect(field).toBeVisible();
  await field.fill('');
  await field.focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'あおい', selectionStart: 3, selectionEnd: 3 });
  await cdp.send('Input.insertText', { text: '葵' });
  await expect(field).toHaveValue('葵');
  await page.locator('.name-entry__start').click();

  // Cutscene: the WebM (VP9 with alpha) source plays, subtitles follow the video.
  const video = page.locator('.bl-cutscene video');
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentSrc))
    .toMatch(/intro[-\w]*\.webm$/);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 })
    .toBeGreaterThan(0.4);
  await expect(page.locator('.bl-cutscene .bl-subtitles__line')).toContainText(
    'Every night the district lights up red.',
  );
  // Holding confirm skips it.
  await page.keyboard.down('Enter');
  await page.waitForTimeout(900);
  await page.keyboard.up('Enter');

  // Scene change through the iris cover.
  await expect(page.locator('.bl-cover')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'story', {
    timeout: 10_000,
  });
  await expect(page.locator('.bl-cover')).toHaveCount(0, { timeout: 5_000 });

  // The typewriter: at 5 characters per second the next line is still typing; confirm finishes
  // it, the next confirm moves on.
  const box = page.locator('.bl-dialogue__box');
  await expect(box).toContainText('The neon of the old district hums in the rain.');
  await page.evaluate(() => ((window.blacklight.ui as UiRuntime).accessibility.textSpeed = 5));
  await nextLine(page);
  await expect(page.locator('.bl-dialogue')).toHaveAttribute('data-typing', 'true');
  expect(await page.locator('.bl-dialogue__text .bl-rt-hidden').first().textContent()).not.toBe('');
  await box.click();
  await expect(page.locator('.bl-dialogue')).not.toHaveAttribute('data-typing', 'true');
  await page.evaluate(() => ((window.blacklight.ui as UiRuntime).accessibility.textSpeed = 45));
  // Name plate, the player's name from the Ink variable, portrait and voice.
  await expect(page.locator('.bl-dialogue__name')).toHaveText('Mira');
  await expect.poll(() => dialogueText(page)).toContain('葵');
  const portrait = page.locator('.bl-dialogue__portrait[data-character="mira"]');
  await expect(portrait).toHaveAttribute('data-expression', 'happy');
  await expect(portrait).toHaveAttribute('src', /mira-happy/);

  // Choices: the conditional one (trust > 2) is hidden.
  await advanceToChoices(page);
  await expect(page.locator('.bl-dialogue__choice')).toHaveText([
    'Follow Mira to the rooftop',
    'Stay with Ren',
  ]);
  await page.locator('.bl-dialogue__choice').first().click();
  expect(
    await page.evaluate(
      () =>
        (window.blacklight.scene as unknown as { dialogue: { vars: Record<string, unknown> } })
          .dialogue.vars.trust,
    ),
  ).toBe(1);
  // `# transition: ink` + `# bg: rooftop`: a cover inside the scene.
  await expect(page.locator('.bl-cover')).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window.blacklight.scene as unknown as { background: string }).background,
      ),
    )
    .toBe('rooftop');

  // `# fx: glitch` pulses a shader on the game. The pulse lasts 0.6 s of wall-clock time, which a
  // poll of `fx.active` can miss on a loaded machine: record the effects as they are added.
  await page.evaluate(() => {
    const fx = (window.blacklight.ui as UiRuntime).fx;
    const added: unknown[] = [];
    const add = fx.add.bind(fx);
    fx.add = (effect, options) => {
      added.push(effect);
      return add(effect, options);
    };
    Object.assign(window, { __fxAdded: added });
  });
  await nextLine(page);
  await expect.poll(() => dialogueText(page)).toContain('flickers');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __fxAdded: unknown[] }).__fxAdded))
    .toContain('glitch');

  // Backlog lists the lines and the chosen choice.
  await page.getByRole('button', { name: 'LOG' }).click();
  await expect(
    page.locator('.bl-backlog__entry').filter({ hasText: 'Follow Mira to the rooftop' }),
  ).toHaveCount(1);
  await expect(page.locator('.bl-backlog__entry')).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bl-backlog')).toHaveCount(0);

  // Save mid-dialogue into slot 1, move on, load: the same line comes back.
  const saved = await dialogueText(page);
  await page.getByRole('button', { name: 'SAVE' }).click();
  await page.locator('.bl-slots__slot[data-slot="1"]').click();
  await expect(page.locator('.bl-slots')).toHaveCount(0);
  await nextLine(page);
  await nextLine(page);
  await page.getByRole('button', { name: 'LOAD' }).click();
  await expect(page.locator('.bl-slots__slot[data-slot="1"]')).toContainText('Chapter 1');
  await page.locator('.bl-slots__slot[data-slot="1"]').click();
  await page.locator('.bl-dialog button').last().click();
  await expect.poll(() => dialogueText(page), { timeout: 10_000 }).toBe(saved);
  expect(errors).toEqual([]);
});

test('Japanese and Arabic: hot language switch, CJK line breaking, right-to-left layout', async ({
  page,
}) => {
  const errors: string[] = [];
  await open(page, errors);
  // Start a story directly (the cutscene is covered by the previous test).
  await page.evaluate(() => window.blacklight.goto('story', { player: 'Aoi' }));
  await expect(page.locator('.bl-dialogue__box')).toBeVisible();

  // Settings › Language › 日本語, from the in-game menu.
  await page.getByRole('button', { name: 'MENU' }).click();
  await page.locator('.bl-pause .bl-menu__item').filter({ hasText: 'SETTINGS' }).click();
  await page.locator('.bl-tabs__tab').filter({ hasText: 'LANGUAGE' }).click();
  await page.locator('.bl-settings__language[data-lang="ja"]').click();
  await expect.poll(() => ui(page)).toBe('ja');
  await expect(page.locator('.bl-ui')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.bl-settings__title')).toHaveText('設定');
  // One screen per Escape: two presses within one frame would count as one.
  await page.keyboard.press('Escape');
  await expect(page.locator('.bl-settings')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bl-pause')).toHaveCount(0);

  // The story continues in Japanese from the next line, with word-level line breaks.
  await nextLine(page);
  await expect(page.locator('.bl-dialogue__name')).toHaveText('ミラ');
  await expect.poll(() => dialogueText(page)).toMatch(/[ぁ-んァ-ン一-龯]/);
  const japanese = page.locator('.bl-dialogue__text .bl-rich-text');
  expect(await japanese.evaluate((el) => el.textContent!.includes('\u200b'))).toBe(true);
  expect(await japanese.evaluate((el) => getComputedStyle(el).wordBreak)).toBe('keep-all');

  // Arabic: the UI turns right to left; the name plate moves to the right edge of the box.
  await page.evaluate(() => (window.blacklight.ui as UiRuntime).i18n.setLocale('ar'));
  await expect(page.locator('.bl-ui')).toHaveAttribute('dir', 'rtl');
  await nextLine(page);
  await expect(page.locator('.bl-dialogue__name')).toHaveText('ميرا');
  await expect.poll(() => dialogueText(page)).toMatch(/[\u0600-\u06ff]/);
  const text = page.locator('.bl-dialogue__text');
  expect(await text.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  const boxRect = (await page.locator('.bl-dialogue__box').boundingBox())!;
  const nameRect = (await page.locator('.bl-dialogue__name').boundingBox())!;
  expect(nameRect.x).toBeGreaterThan(boxRect.x + boxRect.width / 2);
  // Arabic letters stay joined: no per-character elements even inside <wave>.
  expect(await page.locator('.bl-dialogue__text .bl-rt-ch').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('transition library: every effect drawn part-way as a scene cover (screenshots)', async ({
  page,
}) => {
  const errors: string[] = [];
  await open(page, errors);
  // Black covers on a white page, nothing else: the same picture on every OS.
  await page.evaluate(() => {
    const game = window.blacklight;
    game.app.canvas.style.visibility = 'hidden';
    (game.mount.querySelector('.bl-ui') as HTMLElement).style.visibility = 'hidden';
    game.mount.style.background = '#fff';
  });
  for (const name of ['wipe', 'iris', 'ink', 'slices', 'shatter', 'zoom', 'slash']) {
    await page.evaluate((effect) => {
      const transition = window.blacklight.transitions.get(effect)!;
      const size = { width: 1920, height: 1080 };
      transition.draw(undefined as never, 0.15, size);
    }, name);
    await expect(page.locator('#game')).toHaveScreenshot(`transition-${name}.png`, {
      maxDiffPixelRatio: 0.01,
    });
    await page.evaluate((effect) => {
      const transition = window.blacklight.transitions.get(effect)!;
      const size = { width: 1920, height: 1080 };
      transition.draw(undefined as never, 0.25, size);
      transition.draw(undefined as never, 0, size);
    }, name);
    await expect(page.locator('.bl-cover')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test.describe('release build', () => {
  let stopPreview: (() => void) | undefined;
  test.beforeAll(async () => {
    run('pnpm', ['build'], template);
    stopPreview = await serve(template, 'preview', previewPort);
  });
  test.afterAll(() => stopPreview?.());

  test('Ink stories are compiled into the build and play; no .ink source ships', async ({
    page,
  }) => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else files.push(entry.name);
      }
    };
    const dist = join(template, 'dist');
    expect(existsSync(dist)).toBe(true);
    walk(dist);
    expect(files.filter((f) => f.endsWith('.ink'))).toEqual([]);
    expect(files.some((f) => /^intro-[\w-]+\.webm$/.test(f))).toBe(true);
    expect(files.some((f) => /^intro-[\w-]+\.mp4$/.test(f))).toBe(true);
    // The inspector is dev-only.
    expect(files.some((f) => f.startsWith('inspector'))).toBe(false);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`http://localhost:${previewPort}/`);
    await expect(page.locator('.title')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('F9');
    await expect(page.locator('.bl-inspector')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await page.locator('.name-entry__start').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.bl-dialogue__box')).toContainText('The neon of the old district', {
      timeout: 15_000,
    });
    expect(errors).toEqual([]);
  });
});
