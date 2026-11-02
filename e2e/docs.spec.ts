// DOC-02, DOC-03, DOC-04: every live example of the docs runs in the real engine without errors
// and draws on its canvas; a broken example fails this check and `pnpm typecheck`; the playground
// round-trips through its share URL.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const docs = join(repo, 'docs');
const examples = join(docs, 'examples');
const port = 5380;
const site = `http://localhost:${port}`;
let stop: (() => void) | undefined;
/**
 * First appearance of the code editor: CodeMirror is a chunk loaded when an editor mounts, and
 * `vitepress preview` brotli-compresses every response on the fly at the highest quality. On the
 * Windows runner, with the previews' software WebGL keeping the CPUs busy, that one response took
 * 5–8 s (and more than 13 s once), past the 5 s default of an expect.
 */
const EDITOR = 30_000;

/** Markdown files under `dir`, without the generated API reference. */
function pages(dir = docs): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (['node_modules', 'api', 'public', 'examples', '.vitepress'].includes(name)) return [];
    if (statSync(path).isDirectory()) return pages(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

/** URL of a docs page from its file. */
function pageUrl(file: string): string {
  return `/${relative(docs, file)
    .replace(/\\/g, '/')
    .replace(/(index)?\.md$/, '')}`;
}

/** `src` of every `<LiveExample>` and `<BlExercise>` (both draw one live example) by page URL. */
function examplesByPage(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const file of pages()) {
    const sources = [
      ...readFileSync(file, 'utf8').matchAll(/<(?:LiveExample|BlExercise)\s[^>]*src="([^"]+)"/g),
    ];
    if (!sources.length) continue;
    result.set(
      pageUrl(file),
      sources.map((match) => match[1]!),
    );
  }
  return result;
}

/** `src` of every `<BlExercise>` by page URL. */
function exercisesByPage(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const file of pages()) {
    const sources = [...readFileSync(file, 'utf8').matchAll(/<BlExercise\s[^>]*src="([^"]+)"/g)];
    if (sources.length)
      result.set(
        pageUrl(file),
        sources.map((match) => match[1]!),
      );
  }
  return result;
}

/**
 * Tutorial exercises from the files: `tutorials/<topic>/<n>-<name>.ts` or a folder of that name
 * holding a `main.ts`, each with a `.solution` twin. Other files there (checks) are helpers.
 */
function tutorialFiles(): { starts: string[]; solutions: string[] } {
  const starts: string[] = [];
  const solutions: string[] = [];
  const root = join(examples, 'tutorials');
  for (const topic of readdirSync(root)) {
    const dir = join(root, topic);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir)) {
      const id = /^(\d+-[\w-]+?)(\.solution)?(\.ts)?$/.exec(name);
      if (!id || (!id[3] && !existsSync(join(dir, name, 'main.ts')))) continue;
      (id[2] ? solutions : starts).push(`tutorials/${topic}/${id[1]}${id[2] ?? ''}`);
    }
  }
  return { starts: starts.sort(), solutions: solutions.sort() };
}

/** Example ids from the files: `group/name.ts` and folders `group/name/` holding a `main.ts`. */
function exampleFiles(): string[] {
  const ids: string[] = [];
  for (const group of readdirSync(examples)) {
    const dir = join(examples, group);
    if (
      ['assets', 'playground', 'getting-started', 'tutorials'].includes(group) ||
      !statSync(dir).isDirectory()
    )
      continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.ts')) ids.push(`${group}/${name.slice(0, -3)}`);
      else if (existsSync(join(dir, name, 'main.ts'))) ids.push(`${group}/${name}`);
    }
  }
  return [...ids, ...tutorialFiles().starts].sort();
}

/**
 * Scrolls to a live example, waits for its preview and returns what is wrong with it: an error
 * reported by the runner, console errors from the page and its frames, or a blank canvas.
 */
async function checkExample(live: Locator, consoleErrors: string[]): Promise<string[]> {
  await live.scrollIntoViewIfNeeded();
  await expect(live).toHaveAttribute('data-status', /running|error/, { timeout: 45_000 });
  // Errors thrown a few frames after the start still count.
  await live.page().waitForTimeout(500);
  const problems: string[] = [];
  const error = await live.getAttribute('data-error');
  if (error) problems.push(`error: ${error}`);
  if ((await live.getAttribute('data-status')) !== 'running') problems.push('did not run');
  else if (!(Number(await live.getAttribute('data-lit')) > 0)) problems.push('blank canvas');
  problems.push(...consoleErrors.splice(0).map((message) => `console: ${message}`));
  return problems;
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Opens the code of a live example in its full-screen dialog. The dialog mirrors the example's
 * `data-*` state, so it can stand in for the example in the checks below. Returns once its editor
 * is there.
 */
async function openCode(page: Page, live: Locator): Promise<Locator> {
  const dialog = page.locator('.bl-dialog');
  if (!(await dialog.isVisible())) await live.locator('.bl-live__open').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.cm-content')).toBeVisible({ timeout: EDITOR });
  return dialog;
}

/** Closes the code dialog, if it is open. */
async function closeCode(page: Page): Promise<void> {
  const dialog = page.locator('.bl-dialog');
  if (!(await dialog.isVisible())) return;
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

/** Replaces the text of the editor inside `host` and waits for the run it triggers to start. */
async function setEditorText(page: Page, host: Locator, text: string): Promise<void> {
  const run = (await host.getAttribute('data-run')) ?? '0';
  await host.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
  await expect(host).not.toHaveAttribute('data-run', run, { timeout: 10_000 });
}

test.beforeAll(async () => {
  test.setTimeout(600_000);
  if (!process.env.BLACKLIGHT_DOCS_BUILT) run('pnpm', ['run', 'build'], docs);
  stop = await serve(docs, 'preview', port);
});

test.afterAll(() => stop?.());

test('every example file is shown on a docs page', () => {
  const shown = new Set([...examplesByPage().values()].flat());
  const files = exampleFiles();
  expect(files.filter((id) => !shown.has(id))).toEqual([]);
  expect([...shown].filter((id) => !files.includes(id))).toEqual([]);
});

test('every behavior, widget and transition has a live example', () => {
  const files = new Set(exampleFiles());
  const behaviors = readFileSync(join(repo, 'packages/core/src/behaviors/index.ts'), 'utf8')
    .match(/export const behaviors = \{([\s\S]*?)\n\};/)![1]!
    .matchAll(/^ {2}(\w+):/gm);
  const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const required = [
    ...[...behaviors].map((match) => `behaviors/${kebab(match[1]!)}`),
    ...readdirSync(join(repo, 'packages/ui/src/widgets'))
      .filter((name) => name.endsWith('.vue') && name !== 'ToastHost.vue')
      .map((name) => `widgets/${kebab(name.slice(0, -4)).slice(1)}`),
    'widgets/toasts',
    ...[
      ...readFileSync(join(repo, 'packages/ui/src/transitions.ts'), 'utf8').matchAll(
        /defineTransition\('([\w-]+)'/g,
      ),
    ]
      .map((match) => `transitions/${match[1]}`)
      .filter((id) => !id.endsWith('blinds') && !id.endsWith('pop')),
    'transitions/slide-left',
    'transitions/slide-right',
    'transitions/slide-up',
    'transitions/slide-down',
    'transitions/distort',
    'transitions/none',
  ];
  expect(new Set(required).size).toBeGreaterThanOrEqual(19 + 16 + 12);
  expect([...new Set(required)].filter((id) => !files.has(id))).toEqual([]);
});

test('every live example runs, draws and logs no error', async ({ page }) => {
  test.setTimeout(900_000);
  const consoleErrors = watchConsole(page);
  const failures: string[] = [];
  let checked = 0;
  for (const [url, sources] of examplesByPage()) {
    await page.goto(`${site}${url}`);
    const lives = page.locator('.bl-live');
    await expect(lives).toHaveCount(sources.length, { timeout: 30_000 });
    for (let i = 0; i < sources.length; i++) {
      const problems = await checkExample(lives.nth(i), consoleErrors);
      for (const problem of problems) failures.push(`${url} ${sources[i]}: ${problem}`);
      checked++;
    }
  }
  expect(failures).toEqual([]);
  expect(checked).toBeGreaterThan(50);
});

test('a broken example fails the check', async ({ page }) => {
  const consoleErrors = watchConsole(page);
  await page.goto(`${site}/behaviors/eight-directions`);
  const live = page.locator('.bl-live').first();
  expect(await checkExample(live, consoleErrors)).toEqual([]);
  // The editor lives in the dialog the example opens.
  const dialog = await openCode(page, live);
  const source = readFileSync(join(examples, 'behaviors/eight-directions.ts'), 'utf8');

  // An exception at run time.
  await setEditorText(
    page,
    dialog,
    source.replace(
      'override create() {',
      "override create() {\n    throw new Error('broken on purpose');",
    ),
  );
  let problems = await checkExample(dialog, consoleErrors);
  expect(problems.join('\n')).toContain('broken on purpose');

  // A syntax error.
  await setEditorText(page, dialog, source.replace('class Ship', 'class Ship {'));
  problems = await checkExample(dialog, consoleErrors);
  expect(problems.join('\n')).toMatch(/error: .*main\.scene\.ts/);

  // A scene that draws nothing.
  await setEditorText(
    page,
    dialog,
    "import { Scene } from '@blacklight/core';\nexport default class Empty extends Scene {}\n",
  );
  problems = await checkExample(dialog, consoleErrors);
  expect(problems).toEqual(['blank canvas']);

  // Reset brings the example back.
  const run = (await live.getAttribute('data-run'))!;
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(live).not.toHaveAttribute('data-run', run);
  expect(await checkExample(dialog, consoleErrors)).toEqual([]);
});

test('an example opens its code full screen, the panel under the preview', async ({ page }) => {
  await page.goto(`${site}/tutorials/camera`);
  const live = page.locator('.bl-exercise').first().locator('.bl-live');
  await live.scrollIntoViewIfNeeded();
  await expect(live).toHaveAttribute('data-status', /running|error/, { timeout: 45_000 });
  // The check of an exercise is in the popup, not on the page.
  await expect(page.locator('.bl-exercise__status')).toHaveCount(0);
  const dialog = await openCode(page, live);
  await expect(dialog.locator('.bl-exercise__status')).toBeVisible();

  // The whole screen.
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
  // The editor on the left of the preview, the task and the hint in the panel below it.
  const editor = (await dialog.locator('.bl-dialog__editor').boundingBox())!;
  const preview = (await dialog.locator('.bl-dialog__preview').boundingBox())!;
  const panel = (await dialog.locator('.bl-dialog__panel').boundingBox())!;
  expect(editor.x + editor.width).toBeLessThanOrEqual(preview.x);
  expect(panel.y).toBeGreaterThanOrEqual(preview.y + preview.height - 1);
  // The preview keeps the 16:9 of the game, so no black bars push the panel down.
  expect(Math.abs(preview.width / preview.height - 16 / 9)).toBeLessThan(0.02);
  // The close button is at the right edge of the bar.
  const close = (await dialog.getByRole('button', { name: 'Close' }).boundingBox())!;
  expect(box.x + box.width - (close.x + close.width)).toBeLessThan(40);
  await expect(dialog.locator('.cm-content')).toContainText('create()');
  await expect(dialog.locator('.bl-dialog__panel')).toContainText('Hint');
  // The solution is a button under the hint, not a block of code.
  const hint = (await dialog.locator('.bl-dialog__panel summary').first().boundingBox())!;
  const solution = (await dialog.getByRole('button', { name: 'Solution' }).boundingBox())!;
  expect(solution.y).toBeGreaterThan(hint.y);

  // Escape closes it, with the page usable again.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(live).toHaveAttribute('data-status', /running|error/, { timeout: 45_000 });
});

/** Files of an example id, relative to it: `main.ts` for a single file. */
function exampleSources(id: string): Map<string, string> {
  const files = new Map<string, string>();
  if (existsSync(join(examples, `${id}.ts`))) {
    files.set('main.ts', readFileSync(join(examples, `${id}.ts`), 'utf8'));
    return files;
  }
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|json)$/.test(name))
        files.set(
          relative(join(examples, id), path).replace(/\\/g, '/'),
          readFileSync(path, 'utf8'),
        );
    }
  };
  walk(join(examples, id));
  return files;
}

test('every exercise has a solution its button applies, and no page shows it', () => {
  const { starts, solutions } = tutorialFiles();
  const exercises = [...exercisesByPage()].flatMap(([url, ids]) => ids.map((id) => ({ url, id })));
  expect(exercises.map(({ id }) => id).sort()).toEqual(starts);
  expect(starts.map((id) => `${id}.solution`)).toEqual(solutions);
  expect(starts.length).toBeGreaterThanOrEqual(20);
  const problems: string[] = [];
  for (const { url, id } of exercises) {
    const page = readFileSync(join(docs, `${url.slice(1)}.md`), 'utf8');
    // The solution is the button, not a snippet: the editor marks what it changed.
    if (page.includes(`${id}.solution`)) problems.push(`${url}: shows the solution of ${id}`);
    const start = exampleSources(id);
    const solution = exampleSources(`${id}.solution`);
    expect([...solution.keys()].sort(), id).toEqual([...start.keys()].sort());
    if (![...solution].some(([file, text]) => text !== start.get(file)))
      problems.push(`${id}: the solution is the same as the start`);
  }
  expect(problems).toEqual([]);
});

/** Clicks the middle of a preview inside `host`, then holds each key for a moment. */
async function pressKeys(page: Page, host: Locator, keys: string[]): Promise<void> {
  // Held for a few steps: a click shorter than a step is not seen by `pointer.pressed`.
  const box = (await host.locator('.bl-preview iframe').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
  for (const key of keys) {
    await page.keyboard.down(key);
    await page.waitForTimeout(400);
    await page.keyboard.up(key);
  }
}

test('every exercise solution runs, and each check passes on the solution, not on the start', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const consoleErrors = watchConsole(page);
  const failures: string[] = [];
  let checked = 0;
  for (const [url, ids] of exercisesByPage()) {
    await page.goto(`${site}${url}`);
    const exercises = page.locator('.bl-exercise');
    await expect(exercises).toHaveCount(ids.length, { timeout: 30_000 });
    for (let i = 0; i < ids.length; i++) {
      const live = exercises.nth(i).locator('.bl-live');
      const fail = (problem: string) => failures.push(`${url} ${ids[i]}: ${problem}`);
      const checks = (await live.getAttribute('data-check')) === 'true';
      const keys = (await live.getAttribute('data-keys'))?.split(' ') ?? [];
      // The start is covered by "every live example runs…"; here it must not pass its check.
      await live.scrollIntoViewIfNeeded();
      await expect(live).toHaveAttribute('data-status', /running|error/, { timeout: 45_000 });
      if (checks) {
        await pressKeys(page, live, keys);
        await page.waitForTimeout(1_000);
        if ((await live.getAttribute('data-done')) !== 'false') fail('the start passes the check');
      }
      // The task, the hint and the solution are in the panel under the dialog's preview.
      const dialog = await openCode(page, live);
      await expect(dialog.locator('.bl-dialog__panel')).toContainText(/\S/);
      const run = (await live.getAttribute('data-run')) ?? '0';
      await dialog.getByRole('button', { name: 'Solution' }).click();
      await expect(live).not.toHaveAttribute('data-run', run, { timeout: 10_000 });
      await expect(live).toHaveAttribute('data-solution', 'true');
      // The lines the solution changed are marked in the editor.
      await expect(dialog.locator('.cm-highlight-line').first()).toBeVisible();
      for (const problem of await checkExample(dialog, consoleErrors)) fail(`solution ${problem}`);
      if (checks) {
        const deadline = Date.now() + 15_000;
        while ((await live.getAttribute('data-done')) !== 'true' && Date.now() < deadline) {
          // A click on the preview, then the keys: what a reader does to try it.
          await pressKeys(page, dialog, keys);
          await page.waitForTimeout(250);
        }
        if ((await live.getAttribute('data-done')) !== 'true') fail('the solution fails the check');
        else await expect(dialog.locator('.bl-exercise__status')).toContainText('Done');
      }
      await closeCode(page);
      checked++;
    }
  }
  expect(failures).toEqual([]);
  expect(checked).toBeGreaterThanOrEqual(20);
});

test('the solution button keeps the reader code and reverts to it', async ({ page }) => {
  await page.goto(`${site}/tutorials/camera`);
  const live = page.locator('.bl-exercise').first().locator('.bl-live');
  await live.scrollIntoViewIfNeeded();
  await expect(live).toHaveAttribute('data-status', /running|error/, { timeout: 45_000 });
  const dialog = await openCode(page, live);
  const editor = dialog.locator('.cm-content');

  // The reader's own version of the file.
  const start = readFileSync(join(examples, 'tutorials/camera/1-follow.ts'), 'utf8');
  await setEditorText(page, dialog, `// mine\n${start}`);
  await expect(editor).toContainText('// mine');

  await dialog.getByRole('button', { name: 'Solution' }).click();
  await expect(live).toHaveAttribute('data-solution', 'true');
  await expect(editor).not.toContainText('// mine');
  await expect(editor).toContainText('this.camera.follow(runner);');
  await expect(dialog.locator('.cm-highlight-line').first()).toBeVisible();

  // Pressing it again, now Revert, gives the reader their code back, not the starting example.
  await dialog.getByRole('button', { name: 'Revert' }).click();
  await expect(live).not.toHaveAttribute('data-solution', 'true');
  await expect(editor).toContainText('// mine');
  await expect(dialog.locator('.cm-highlight-line')).toHaveCount(0);
  await expect(live).toHaveAttribute('data-status', /running|error/, { timeout: 45_000 });
});

test('a type error in an example fails pnpm typecheck', () => {
  const broken = join(examples, 'behaviors', 'zz-typecheck-probe.ts');
  writeFileSync(
    broken,
    "import { behaviors } from '@blacklight/core';\nexport const spec = behaviors.eightDirections({ speed: 'fast' });\n",
  );
  try {
    const result = spawnSync('pnpm', ['run', 'typecheck'], {
      cwd: docs,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('zz-typecheck-probe.ts');
  } finally {
    rmSync(broken, { force: true });
  }
  const clean = spawnSync('pnpm', ['run', 'typecheck'], {
    cwd: docs,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  expect(clean.status, clean.stdout + clean.stderr).toBe(0);
});

test('the playground runs a project and restores it from its share URL', async ({
  page,
  browser,
}) => {
  const consoleErrors = watchConsole(page);
  await page.goto(`${site}/playground`);
  const playground = page.locator('.bl-play');
  await expect(playground).toHaveAttribute('data-status', 'running', { timeout: 45_000 });
  const preview = page.frameLocator('.bl-play iframe');
  await expect(preview.getByText('/ 12')).toBeVisible();

  // Edit the scene: fewer coins and a marker comment.
  await playground.getByRole('button', { name: 'scenes/main/main.scene.ts', exact: true }).click();
  const scene = readFileSync(join(examples, 'playground/scenes/main/main.scene.ts'), 'utf8');
  const edited = `// shared from the e2e test\n${scene.replace('total: 12', 'total: 3')}`;
  await setEditorText(page, playground, edited);
  await expect(page).toHaveURL(/#project=/, { timeout: 10_000 });
  await expect(preview.getByText('/ 3')).toBeVisible({ timeout: 45_000 });
  await expect(playground).toHaveAttribute('data-status', 'running');

  await playground.getByRole('button', { name: 'Share' }).click();
  const link = await playground.getByLabel('Link to this project').inputValue();
  expect(link).toBe(page.url());
  expect(link).toContain('#project=');
  // Done with the first page: its game would keep rendering next to the copy's (software WebGL on
  // the Windows runner, where two running previews starve each other and closing a context then
  // waited minutes).
  await page.goto('about:blank');

  // Open the link in a fresh browser context: same files, same game.
  const other = await browser.newContext();
  const copy = await other.newPage();
  const copyErrors = watchConsole(copy);
  await copy.goto(link);
  const restored = copy.locator('.bl-play');
  await expect(restored).toHaveAttribute('data-status', 'running', { timeout: 45_000 });
  await restored.getByRole('button', { name: 'scenes/main/main.scene.ts', exact: true }).click();
  await expect(restored.locator('.cm-content')).toContainText('// shared from the e2e test', {
    timeout: EDITOR,
  });
  await expect(copy.frameLocator('.bl-play iframe').getByText('/ 3')).toBeVisible();

  // A damaged link says so and falls back to the starting project.
  await copy.goto(`${site}/playground#project=not-a-project`);
  await copy.reload();
  await expect(restored).toHaveAttribute('data-link-error', /link is damaged/, {
    timeout: 15_000,
  });
  await expect(restored).toHaveAttribute('data-status', 'running', { timeout: 45_000 });
  // The game stops with the page before the context closes.
  await copy.goto('about:blank');
  await other.close();

  expect(consoleErrors).toEqual([]);
  expect(copyErrors).toEqual([]);
});

test('the docs load nothing from other origins', async ({ page }) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && !/^(data|blob):/.test(url.protocol))
      outside.push(request.url());
  });
  for (const path of ['/', '/guide/getting-started', '/playground', '/api/']) {
    await page.goto(`${site}${path}`);
    await page.waitForLoadState('networkidle');
  }
  expect(outside).toEqual([]);
});
