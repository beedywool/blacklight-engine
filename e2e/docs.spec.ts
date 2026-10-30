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

/** Markdown files under `dir`, without the generated API reference. */
function pages(dir = docs): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (['node_modules', 'api', 'public', 'examples', '.vitepress'].includes(name)) return [];
    if (statSync(path).isDirectory()) return pages(path);
    return name.endsWith('.md') ? [path] : [];
  });
}

/** `src` of every `<LiveExample>` by page URL. */
function examplesByPage(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const file of pages()) {
    const sources = [...readFileSync(file, 'utf8').matchAll(/<LiveExample\s[^>]*src="([^"]+)"/g)];
    if (!sources.length) continue;
    const url = `/${relative(docs, file)
      .replace(/\\/g, '/')
      .replace(/(index)?\.md$/, '')}`;
    result.set(
      url,
      sources.map((match) => match[1]!),
    );
  }
  return result;
}

/** Example ids from the files: `group/name.ts` and folders `group/name/` holding a `main.ts`. */
function exampleFiles(): string[] {
  const ids: string[] = [];
  for (const group of readdirSync(examples)) {
    const dir = join(examples, group);
    if (['assets', 'playground', 'getting-started'].includes(group) || !statSync(dir).isDirectory())
      continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith('.ts')) ids.push(`${group}/${name.slice(0, -3)}`);
      else if (existsSync(join(dir, name, 'main.ts'))) ids.push(`${group}/${name}`);
    }
  }
  return ids.sort();
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
  const source = readFileSync(join(examples, 'behaviors/eight-directions.ts'), 'utf8');

  // An exception at run time.
  await setEditorText(
    page,
    live,
    source.replace(
      'override create() {',
      "override create() {\n    throw new Error('broken on purpose');",
    ),
  );
  let problems = await checkExample(live, consoleErrors);
  expect(problems.join('\n')).toContain('broken on purpose');

  // A syntax error.
  await setEditorText(page, live, source.replace('class Ship', 'class Ship {'));
  problems = await checkExample(live, consoleErrors);
  expect(problems.join('\n')).toMatch(/error: .*main\.scene\.ts/);

  // A scene that draws nothing.
  await setEditorText(
    page,
    live,
    "import { Scene } from '@blacklight/core';\nexport default class Empty extends Scene {}\n",
  );
  problems = await checkExample(live, consoleErrors);
  expect(problems).toEqual(['blank canvas']);

  // Reset brings the example back.
  const run = (await live.getAttribute('data-run'))!;
  await live.getByRole('button', { name: 'Reset' }).click();
  await expect(live).not.toHaveAttribute('data-run', run);
  expect(await checkExample(live, consoleErrors)).toEqual([]);
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

  // Open the link in a fresh browser context: same files, same game.
  const other = await browser.newContext();
  const copy = await other.newPage();
  const copyErrors = watchConsole(copy);
  await copy.goto(link);
  const restored = copy.locator('.bl-play');
  await expect(restored).toHaveAttribute('data-status', 'running', { timeout: 45_000 });
  await restored.getByRole('button', { name: 'scenes/main/main.scene.ts', exact: true }).click();
  await expect(restored.locator('.cm-content')).toContainText('// shared from the e2e test');
  await expect(copy.frameLocator('.bl-play iframe').getByText('/ 3')).toBeVisible();

  // A damaged link says so and falls back to the starting project.
  await copy.goto(`${site}/playground#project=not-a-project`);
  await copy.reload();
  await expect(restored).toHaveAttribute('data-link-error', /link is damaged/, {
    timeout: 15_000,
  });
  await expect(restored).toHaveAttribute('data-status', 'running', { timeout: 45_000 });
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
