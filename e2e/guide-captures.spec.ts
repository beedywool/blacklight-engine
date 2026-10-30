// DOC-01: the screenshots and terminal output of "Install the tools" and "Getting started" come
// from this test. It follows the two guides on a fresh project: create, install, `pnpm dev`, the
// game in the browser, the project in VS Code with the extension built from this repository
// (installed from its .vsix like a user would), then the guide's hero, title menu and pause menu.
// Each step asserts what the picture shows, so a broken step fails here.
//
// `pnpm docs:screenshots` runs it with BLACKLIGHT_WRITE_CAPTURES=1 and writes the files into
// docs/guide/captures/; otherwise they go to the test's output folder and the docs stay untouched.
// VS Code is downloaded into packages/vscode/.vscode-test/ by @vscode/test-electron, like the
// extension's integration tests (VSCODE_EXECUTABLE uses an installed one instead).
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { stripVTControlCharacters } from 'node:util';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { Game } from '@blacklight/core';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const docs = join(repo, 'docs');
const captures = join(docs, 'guide', 'captures');
const finished = join(docs, 'examples', 'getting-started');
const extension = join(repo, 'packages', 'vscode');
const port = 5383;
const write = !!process.env.BLACKLIGHT_WRITE_CAPTURES;
// Shortcuts below are the Linux and Windows ones; one OS is enough for pictures.
test.skip(process.platform !== 'linux', 'Captures are taken on Linux.');
// The check of the pages reads the files the capture test writes.
test.describe.configure({ mode: 'serial' });

/** Pages that show captures, and the file names they use. */
function usedCaptures(): string[] {
  const names = new Set<string>();
  for (const page of ['installation.md', 'getting-started.md']) {
    const text = readFileSync(join(docs, 'guide', page), 'utf8');
    for (const match of text.matchAll(/(?:\(\.\/captures\/|@\/guide\/captures\/)([\w.-]+)/g))
      names.add(match[1]!);
  }
  return [...names].sort();
}

/** Every capture the test writes, by file name. */
const CAPTURES = [
  'create.txt',
  'dev.txt',
  'browser-empty.png',
  'vscode-extension.png',
  'vscode-project.png',
  'vscode-actions.png',
  'vscode-animations.png',
  'browser-title.png',
  'browser-field.png',
  'browser-pause.png',
];

/** Removes colors and the machine's paths and ports from command output. */
function clean(text: string, work: string, devPort?: number): string {
  let out = stripVTControlCharacters(text).replaceAll(work, '~').replace(/\r/g, '');
  if (devPort) out = out.replaceAll(`:${devPort}`, ':5173');
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Project files of the finished guide (the docs-only tsconfig is not one of them). */
function guideFiles(dir = finished): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return guideFiles(path);
    const file = relative(finished, path).replace(/\\/g, '/');
    return file === 'tsconfig.json' ? [] : [file];
  });
}

/** VS Code settings for clean pictures: no welcome page, chat, minimap or auto-closed quotes. */
const SETTINGS = {
  'workbench.colorTheme': 'Default Dark Modern',
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'workbench.layoutControl.enabled': false,
  'window.commandCenter': false,
  'window.restoreWindows': 'none',
  'chat.disableAIFeatures': true,
  'extensions.ignoreRecommendations': true,
  'extensions.autoCheckUpdates': false,
  'telemetry.telemetryLevel': 'off',
  'update.mode': 'none',
  'git.enabled': false,
  'editor.minimap.enabled': false,
  'editor.stickyScroll.enabled': false,
  'editor.lightbulb.enabled': 'off',
  'editor.autoClosingBrackets': 'never',
  'editor.autoClosingQuotes': 'never',
  'editor.fontSize': 15,
};

/** Downloads VS Code like the extension's integration tests, unless VSCODE_EXECUTABLE is set. */
async function vscodeExecutable(): Promise<{ code: string; cli: string }> {
  // A dependency of the extension package, not of the repository root.
  const testElectron = createRequire(join(extension, 'package.json'))('@vscode/test-electron') as {
    downloadAndUnzipVSCode(options: { cachePath: string }): Promise<string>;
    resolveCliPathFromVSCodeExecutablePath(executable: string): string;
  };
  const code =
    process.env.VSCODE_EXECUTABLE ??
    (await testElectron.downloadAndUnzipVSCode({ cachePath: join(extension, '.vscode-test') }));
  return { code, cli: testElectron.resolveCliPathFromVSCodeExecutablePath(code) };
}

/** Packages the extension, installs it in a fresh profile and opens `folder`. */
async function openVsCode(
  work: string,
  folder: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const packaged = spawnSync('pnpm', ['--filter', 'blacklight-vscode', 'package'], {
    cwd: repo,
    encoding: 'utf8',
  });
  expect(packaged.status, packaged.stdout + packaged.stderr).toBe(0);
  const { code, cli } = await vscodeExecutable();
  const profile = [
    '--user-data-dir',
    join(work, 'vscode-user'),
    '--extensions-dir',
    join(work, 'vscode-extensions'),
  ];
  mkdirSync(join(work, 'vscode-user', 'User'), { recursive: true });
  writeFileSync(join(work, 'vscode-user', 'User', 'settings.json'), JSON.stringify(SETTINGS));
  const install = spawnSync(
    cli,
    ['--install-extension', join(extension, 'dist', 'blacklight.vsix'), ...profile],
    { encoding: 'utf8' },
  );
  expect(install.status, install.stderr).toBe(0);
  expect(install.stdout).toContain('successfully installed');

  const app = await _electron.launch({
    executablePath: code,
    args: [
      folder,
      ...profile,
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-gpu',
      '--no-sandbox',
    ],
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    window.setSize(1100, 700);
    window.center();
  });
  await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 60_000 });
  return { app, page };
}

/** Opens a file of the workspace by name with Quick Open. */
async function openFile(page: Page, name: string): Promise<void> {
  // Files written a moment ago show up once the file watcher saw them.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+P');
    await page.keyboard.type(name);
    await expect(page.locator('.quick-input-list .monaco-list-row').first()).toContainText(name, {
      timeout: 3_000,
    });
  }).toPass({ timeout: 30_000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('.tab.active')).toContainText(name);
  await expect(page.locator('.monaco-editor .view-lines')).toBeVisible();
}

/** Drops the edits of the active file. */
async function revert(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('File: Revert File');
  await expect(page.locator('.quick-input-list .monaco-list-row').first()).toContainText(
    'Revert File',
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('.tab.active.dirty')).toHaveCount(0);
}

/** Starts a new line after `line` and types `text`, then asks for completion. */
async function complete(page: Page, line: number, text: string, expected: string[]): Promise<void> {
  const position = page.locator('.statusbar');
  await page.locator('.editor-instance .monaco-editor').first().click();
  await page.keyboard.press('Control+G');
  await expect(page.locator('.quick-input-widget')).toBeVisible();
  await page.keyboard.type(String(line));
  await page.keyboard.press('Enter');
  await expect(page.locator('.quick-input-widget')).toBeHidden();
  await expect(position).toContainText(`Ln ${line},`);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(position).toContainText(`Ln ${line + 1},`);
  // The new line is indented already.
  await page.keyboard.type(text);
  const rows = page.locator('.suggest-widget .monaco-list-row');
  // The TypeScript server starts with the first file and answers with plain words until it is
  // ready: ask again until the expected names are there.
  await expect(async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Space');
    await expect(rows.first()).toBeVisible({ timeout: 3_000 });
    const names = await rows.evaluateAll((elements) =>
      // Optional fields end with `?`.
      elements.map((element) =>
        (element.querySelector('.label-name')?.textContent ?? '').replace(/\?$/, ''),
      ),
    );
    expect(names).toEqual(expect.arrayContaining(expected));
  }).toPass({ timeout: 90_000 });
}

test('every step of the installation and getting-started guides, captured', async ({
  page,
}, info) => {
  test.setTimeout(900_000);
  const out = write ? captures : info.outputPath('captures');
  mkdirSync(out, { recursive: true });
  const save = (name: string, content: string | Buffer) => {
    expect(CAPTURES).toContain(name);
    writeFileSync(join(out, name), content);
  };
  const work = mkdtempSync(join(tmpdir(), 'blacklight-captures-'));
  const game = join(work, 'my-game');
  let stop: (() => void) | undefined;
  let vscode: ElectronApplication | undefined;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 720 });

  try {
    await test.step('pnpm create blacklight', () => {
      // The local engine instead of npm versions; the output is the same apart from the paths.
      const created = spawnSync(
        process.execPath,
        [join(repo, 'packages/create/dist/index.js'), 'my-game', '--link', repo],
        { cwd: work, encoding: 'utf8' },
      );
      expect(created.status, created.stderr).toBe(0);
      expect(created.stdout).toContain('from the "empty" template');
      save('create.txt', `$ pnpm create blacklight my-game\n${clean(created.stdout, work)}\n`);
      run('pnpm', ['install'], game);
    });

    let output = '';
    await test.step('pnpm dev, the empty game in the browser', async () => {
      stop = await serve(game, 'dev', port, (text) => (output += text));
      await expect.poll(() => clean(output, work)).toContain('Local:');
      const lines = clean(output, work, port)
        .split('\n')
        .filter((line) => !line.startsWith('$ ') && !line.startsWith('> '));
      save('dev.txt', `$ pnpm dev\n${lines.join('\n')}\n`);
      await page.goto(`http://localhost:${port}/`);
      await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'title', {
        timeout: 30_000,
      });
      await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running');
      await page.waitForTimeout(500);
      save('browser-empty.png', await page.screenshot());
    });

    await test.step('VS Code: the extension, the project and its completion', async () => {
      const opened = await openVsCode(work, game);
      vscode = opened.app;
      const code = opened.page;
      const activity = (name: string) => code.locator(`.activitybar a[aria-label^="${name}"]`);

      // Extensions view: the extension built from the repository is installed.
      await activity('Extensions').click();
      // The search box takes the focus when the view opens.
      await expect(code.locator('.extensions-viewlet .suggest-input-container')).toBeVisible();
      await code.keyboard.type('@installed');
      const installed = code.locator('.extensions-viewlet .extension-list-item');
      await expect(installed).toHaveCount(1, { timeout: 30_000 });
      await expect(installed.first()).toContainText('Blacklight Engine');
      await code.mouse.move(600, 500);
      save('vscode-extension.png', await code.screenshot());

      // Explorer: the project tree, game.config.ts with its typed fields.
      await activity('Explorer').click();
      await expect(code.locator('.explorer-folders-view')).toContainText('scenes');
      await expect(activity('Blacklight')).toBeVisible();
      await openFile(code, 'game.config.ts');
      // The TypeScript server starts with the first file: hover until it answers.
      const hover = code.locator('.monaco-hover:not(.hidden)');
      await expect(async () => {
        await code.mouse.move(900, 600);
        await code
          .locator('.editor-instance .view-line span', { hasText: /^entry$/ })
          .first()
          .hover();
        await expect(hover).toContainText('first scene', { timeout: 3_000 });
      }).toPass({ timeout: 90_000 });
      save('vscode-project.png', await code.screenshot());
      await code.mouse.move(900, 600);

      // The Blacklight view and the completion of action names.
      await activity('Blacklight').click();
      await expect(code.locator('.sidebar .title-label')).toContainText('Live Objects');
      // The game is still open in the browser: the view lists the objects of its scene.
      await expect(code.locator('.sidebar .monaco-list')).toContainText('3 objects', {
        timeout: 30_000,
      });
      await openFile(code, 'title.scene.ts');
      await complete(code, 30, "if (this.input.pressed('", ['confirm', 'jump', 'pause']);
      save('vscode-actions.png', await code.screenshot());
      await code.keyboard.press('Escape');
      await revert(code);
    });

    await test.step('the guide: UI layer, then every file the guide shows', async () => {
      stop?.();
      stop = undefined;
      run('pnpm', ['add', `@blacklight/ui@link:${join(repo, 'packages/ui')}`, 'vue@3.5.44'], game);
      for (const file of guideFiles()) {
        mkdirSync(join(game, file, '..'), { recursive: true });
        cpSync(join(finished, file), join(game, file));
      }
      run('pnpm', ['typecheck'], game);
    });

    await test.step('VS Code: animation names of hero.anim.json', async () => {
      const code = (await vscode!.firstWindow()) as Page;
      await code.keyboard.press('Control+Shift+E');
      await openFile(code, 'hero.object.ts');
      const hero = readFileSync(join(finished, 'objects/hero/hero.object.ts'), 'utf8').split('\n');
      const line = hero.findIndex((text) => text.includes('override update()')) + 1;
      await complete(code, line, "this.play('", ['idle', 'run']);
      save('vscode-animations.png', await code.screenshot());
      await revert(code);
      await vscode!.close();
      vscode = undefined;
    });

    await test.step('the title menu, the field and the pause menu', async () => {
      stop = await serve(game, 'dev', port);
      await page.goto(`http://localhost:${port}/`);
      const mount = page.locator('#game');
      await expect(mount).toHaveAttribute('data-blacklight-scene', 'title', { timeout: 30_000 });
      await expect(page.locator('.bl-menu__item', { hasText: 'START' })).toBeVisible();
      await page.waitForTimeout(800);
      save('browser-title.png', await page.screenshot());

      await page.keyboard.press('Enter');
      await expect(mount).toHaveAttribute('data-blacklight-scene', 'field', { timeout: 10_000 });
      await page.waitForTimeout(800);
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(450);
      const animation = await page.evaluate(
        () => (window.blacklight.scene!.find('Hero') as unknown as { animation: string }).animation,
      );
      expect(animation).toBe('run');
      save('browser-field.png', await page.screenshot());
      await page.keyboard.up('ArrowRight');

      await page.keyboard.press('Escape');
      await expect(page.locator('.bl-menu__item', { hasText: 'RESUME' })).toBeVisible();
      await page.waitForTimeout(800);
      save('browser-pause.png', await page.screenshot());
    });
    expect(errors).toEqual([]);
  } finally {
    await vscode?.close();
    stop?.();
    rmSync(work, { recursive: true, force: true });
  }
});

test('the guides show every capture and nothing else', () => {
  expect(usedCaptures()).toEqual([...CAPTURES].sort());
  for (const name of CAPTURES) expect(existsSync(join(captures, name)), name).toBe(true);
});

declare global {
  interface Window {
    blacklight: Game;
  }
}
