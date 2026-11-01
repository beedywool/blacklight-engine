// Phase 3e gate: `blacklight add sqlite` in a fresh project (through a static registry index),
// OIDC login against a mock provider with account linking on the reference server, and offline
// queues that replay when the network returns.
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Game } from '@blacklight/core';
import {
  startMockProvider,
  type MockProvider,
} from '../packages/modules/accounts-oidc/src/testing';
import { spawnReferenceServer, type SpawnedServer } from '../servers/reference/test/spawn';
import { run, serve } from './server';

const repo = resolve(import.meta.dirname, '..');
const REGISTRY_PORT = 5350;
const GAME_PORT = 5351;
const PROVIDER_PORT = 5352;
const SERVER_PORT = 5353;
const GAME_ID = 'com.example.mygame';

let work: string;
let game: string;
let registry: Server | undefined;
let provider: MockProvider | undefined;
let reference: SpawnedServer | undefined;
let stop: (() => void) | undefined;

declare global {
  interface Window {
    blacklight: Game;
  }
}

/** Serves a folder as static files (the registry index is a set of JSON files). */
function serveStatic(dir: string, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const path = join(dir, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    if (!path.startsWith(dir) || !existsSync(path)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': extname(path) === '.json' ? 'application/json' : 'text/plain',
    });
    createReadStream(path).pipe(res);
  });
  return new Promise((done) => server.listen(port, () => done(server)));
}

/**
 * Runs a command without blocking this process: the registry and the mock provider are served
 * from here, and `spawnSync` would stop them from answering.
 */
function exec(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} failed in ${cwd}`)),
    );
  });
}

function blacklight(...args: string[]): Promise<void> {
  return exec(process.execPath, [join(repo, 'packages/cli/dist/cli.js'), ...args], game);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'blacklight-e2e-modules-'));
  const index = join(work, 'registry');
  run(
    process.execPath,
    [
      join(repo, 'packages/registry/dist/cli.js'),
      'build',
      join(repo, 'packages/registry/index'),
      '--out',
      index,
      '--local',
      join(repo, 'packages/modules'),
    ],
    repo,
  );
  registry = await serveStatic(index, REGISTRY_PORT);
  provider = await startMockProvider({ port: PROVIDER_PORT });
  reference = await spawnReferenceServer(
    { [GAME_ID]: { achievements: ['first-win'], leaderboards: { 'high-score': {} } } },
    [{ issuer: provider.issuer, audiences: ['e2e-game'] }],
    SERVER_PORT,
  );

  run(
    process.execPath,
    [join(repo, 'packages/create/dist/index.js'), 'my-game', '--link', repo],
    work,
  );
  game = join(work, 'my-game');
  run('pnpm', ['install'], game);
});

test.afterAll(async () => {
  stop?.();
  await reference?.stop();
  await provider?.close();
  await new Promise<void>((done) => (registry ? registry.close(() => done()) : done()));
  rmSync(work, { recursive: true, force: true });
});

test('blacklight add installs modules from the registry and types game.modules', async () => {
  const registryUrl = `http://localhost:${REGISTRY_PORT}`;
  await blacklight('search', 'sql', '--registry', registryUrl);
  await blacklight('add', 'sqlite', '--registry', registryUrl);
  // accounts-oidc brings its dependency (http) along.
  await blacklight('add', 'accounts-oidc', '--registry', registryUrl);
  await blacklight('add', 'achievements', '--registry', registryUrl);

  const manifest = JSON.parse(readFileSync(join(game, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  for (const name of ['sqlite', 'http', 'accounts-oidc', 'achievements']) {
    expect(manifest.dependencies[`@blacklight/module-${name}`]).toBe(
      `link:${join(repo, 'packages/modules', name)}`,
    );
    expect(
      existsSync(join(game, 'node_modules/@blacklight', `module-${name}`, 'package.json')),
    ).toBe(true);
  }
  const config = readFileSync(join(game, 'game.config.ts'), 'utf8');
  expect(config).toMatch(/sqlite: \{\}/);
  expect(config).toMatch(/'accounts-oidc': \{\}/);
  expect(readFileSync(join(game, '.blacklight/types.d.ts'), 'utf8')).toContain(
    `ModuleApiOf<typeof import("@blacklight/module-sqlite"), "sqlite">`,
  );

  // Options for the test servers, then a game file that uses the typed modules.
  writeFileSync(
    join(game, 'game.config.ts'),
    config
      .replace(
        'sqlite: {}',
        "sqlite: { migrations: ['CREATE TABLE scores (name TEXT NOT NULL, points INTEGER NOT NULL)'] }",
      )
      .replace(
        "'accounts-oidc': {}",
        `'accounts-oidc': { issuer: '${provider!.issuer}', clientId: 'e2e-game', server: 'http://localhost:${SERVER_PORT}' }`,
      ),
  );
  writeFileSync(
    join(game, 'scenes/title/scores.ts'),
    `import type { Game } from '@blacklight/core';

export async function best(game: Game): Promise<{ name: string; points: number }[]> {
  const player: string | undefined = game.modules['accounts-oidc'].user?.name;
  await game.modules.achievements.unlock('first-win');
  // @ts-expect-error: only installed modules exist
  void game.modules.nope;
  void player;
  return game.modules.sqlite.query<{ name: string; points: number }>(
    'SELECT name, points FROM scores ORDER BY points DESC',
  );
}
`,
  );
  await exec('pnpm', ['typecheck'], game);
});

test('modules run in the browser: SQLite persists, OIDC login links the account', async ({
  page,
}) => {
  stop = await serve(game, 'dev', GAME_PORT);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const ready = async () => {
    await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
      timeout: 30_000,
    });
  };
  await page.goto(`http://localhost:${GAME_PORT}/`);
  await ready();

  await page.evaluate(async () => {
    const { sqlite } = window.blacklight.modules;
    await sqlite.execute('INSERT INTO scores VALUES (?, ?)', ['ann', 1200]);
    await sqlite.execute('INSERT INTO scores VALUES (?, ?)', ['bob', 900]);
  });
  // Written to OPFS shortly after each change: wait until the file holds the last row (a fixed
  // delay is too short on a loaded machine), then prove the reload reads it back.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        type Folder = AsyncIterable<[string, FileSystemHandle]>;
        const root = await navigator.storage.getDirectory();
        for await (const [name, folder] of root as unknown as Folder) {
          if (!name.startsWith('blacklight-') || folder.kind !== 'directory') continue;
          for await (const [file, handle] of folder as unknown as Folder) {
            if (handle.kind !== 'file') continue;
            const data = await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer();
            if (file !== '.probe' && new TextDecoder('latin1').decode(data).includes('bob'))
              return true;
          }
        }
        return false;
      }),
    )
    .toBe(true);
  await page.reload();
  await ready();
  const rows = await page.evaluate(() =>
    window.blacklight.modules.sqlite.query('SELECT name, points FROM scores ORDER BY points DESC'),
  );
  expect(rows).toEqual([
    { name: 'ann', points: 1200 },
    { name: 'bob', points: 900 },
  ]);

  // Login: the page leaves for the provider and comes back with a code.
  expect(await page.evaluate(() => window.blacklight.modules['accounts-oidc'].loggedIn)).toBe(
    false,
  );
  await Promise.all([
    page.waitForURL(/[?&]code=/, { waitUntil: 'commit' }),
    page.evaluate(() => void window.blacklight.modules['accounts-oidc'].login()),
  ]);
  await ready();
  await expect
    .poll(() => page.evaluate(() => window.blacklight.modules['accounts-oidc'].user?.sub))
    .toBe('user-1');
  expect(page.url()).not.toContain('code=');
  expect(provider!.requests).toEqual(
    expect.arrayContaining(['/.well-known/openid-configuration', '/authorize', '/token']),
  );
  const account = await page.evaluate(
    () => window.blacklight.modules['accounts-oidc'].serverAccount,
  );
  expect(account?.identities).toEqual([{ issuer: provider!.issuer, subject: 'user-1' }]);
  expect(errors).toEqual([]);
});

async function serverAchievements(page: Page): Promise<string[]> {
  const token = await page.evaluate(() => window.blacklight.modules['accounts-oidc'].serverToken());
  const response = await fetch(`http://localhost:${SERVER_PORT}/v1/games/${GAME_ID}/achievements`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const data = (await response.json()) as { achievements: { id: string }[] };
  return data.achievements.map((a) => a.id);
}

test('offline unlocks and queued requests replay when the network returns', async ({
  page,
  context,
}) => {
  // A new browser context: sign in again (same identity, same server account).
  await page.goto(`http://localhost:${GAME_PORT}/`);
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
    timeout: 30_000,
  });
  await Promise.all([
    page.waitForURL(/[?&]code=/, { waitUntil: 'commit' }),
    page.evaluate(() => void window.blacklight.modules['accounts-oidc'].login()),
  ]);
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
    timeout: 30_000,
  });
  await expect
    .poll(() => page.evaluate(() => window.blacklight.modules['accounts-oidc'].loggedIn))
    .toBe(true);

  await context.setOffline(true);
  const pending = await page.evaluate(async () => {
    const { achievements, http } = window.blacklight.modules;
    await achievements.unlock('first-win');
    await achievements.submitScore('high-score', 4200);
    await http.send(`http://localhost:5353/health`, { method: 'GET' });
    return { achievements: achievements.pending, http: http.pending, online: http.online };
  });
  expect(pending).toEqual({ achievements: 2, http: 1, online: false });
  expect(await serverAchievements(page)).toEqual([]);

  await context.setOffline(false);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { achievements, http } = window.blacklight.modules;
        return achievements.pending + http.pending;
      }),
    )
    .toBe(0);
  expect(await serverAchievements(page)).toEqual(['first-win']);
  const board = await page.evaluate(() =>
    window.blacklight.modules.achievements.leaderboard('high-score'),
  );
  expect(board).toEqual([{ rank: 1, name: 'tester', score: 4200 }]);
});

test('a release build bundles the modules', async () => {
  await exec('pnpm', ['build'], game);
  expect(existsSync(join(game, 'dist/index.html'))).toBe(true);
});
