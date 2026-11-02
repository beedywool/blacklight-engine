// DOC-07: a GitHub release, without GitHub. Every package is packed as the release workflow packs
// it (scripts/release-pack.mjs), the folder is served over HTTP under the asset names, and a game
// is created with the documented command (`pnpm dlx <release>/create-blacklight.tgz my-game`), installed
// with plain `pnpm install` (no link, no npm registry for @blacklight/*) and built. Then a module
// is added from the same release and the game is upgraded to a second one.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const repo = resolve(import.meta.dirname, '..');
const PORT = 5390;
const BASE = `http://127.0.0.1:${PORT}`;
const VERSION = '0.99.0';
const NEXT = '0.99.1';

let work: string;
let game: string;
let server: Server | undefined;

/** The release folder as GitHub serves it: one `.tgz` per asset name, 404 for anything else. */
function serveRelease(dir: string): Promise<Server> {
  const files = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url ?? '/', BASE).pathname.slice(1));
    const path = join(dir, name);
    if (name.includes('/') || !name.endsWith('.tgz') || !existsSync(path)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    createReadStream(path).pipe(res);
  });
  return new Promise((done) => files.listen(PORT, '127.0.0.1', () => done(files)));
}

/** Runs a command without blocking this process, which serves the release. */
function exec(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...env },
    });
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args.join(' ')} failed in ${cwd}`)),
    );
  });
}

function manifest(): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(game, 'package.json'), 'utf8'));
}

// The release's URLs replace GitHub's for create-blacklight and `blacklight upgrade`; pnpm's dlx
// cache is skipped so a rerun takes the freshly packed scaffolder.
const env = { BLACKLIGHT_RELEASE_URL: BASE, pnpm_config_dlx_cache_max_age: '0' };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'blacklight-e2e-release-'));
  const release = join(work, 'release');
  // VERSION last: its scaffolder is the version-less create-blacklight.tgz, like the latest release.
  for (const version of [NEXT, VERSION]) {
    await exec(
      process.execPath,
      [
        join(repo, 'scripts/release-pack.mjs'),
        '--version',
        version,
        '--out',
        release,
        '--base-url',
        BASE,
      ],
      repo,
    );
  }
  server = await serveRelease(release);
  game = join(work, 'my-game');
});

test.afterAll(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('a game created from the release tarballs installs and builds without a link', async () => {
  test.setTimeout(600_000);
  await exec('pnpm', ['dlx', `${BASE}/create-blacklight.tgz`, 'my-game'], work, env);

  const { dependencies, devDependencies } = manifest();
  const engine = Object.entries({ ...dependencies, ...devDependencies }).filter(([name]) =>
    name.startsWith('@blacklight/'),
  );
  expect(engine.map(([name]) => name).sort()).toEqual([
    '@blacklight/cli',
    '@blacklight/core',
    '@blacklight/native',
  ]);
  for (const [name, spec] of engine) {
    expect(spec).toBe(`${BASE}/${name.slice(1).replace('/', '-')}-${VERSION}.tgz`);
  }

  await exec('pnpm', ['install'], game);
  // The CLI's own engine dependencies (create-blacklight, registry, mobile) came from the release.
  const cli = JSON.parse(
    readFileSync(join(game, 'node_modules/@blacklight/cli/package.json'), 'utf8'),
  ) as { version: string; peerDependencies: Record<string, string> };
  expect(cli.version).toBe(VERSION);
  expect(cli.peerDependencies['create-blacklight']).toBe(
    `${BASE}/create-blacklight-${VERSION}.tgz`,
  );
  expect(readFileSync(join(game, 'pnpm-lock.yaml'), 'utf8')).not.toMatch(/link:/);

  await exec('pnpm', ['build'], game);
  expect(existsSync(join(game, 'dist/index.html'))).toBe(true);
});

test('modules come from the same release, and upgrade moves every package', async () => {
  test.setTimeout(600_000);
  // No registry at that address: `add` uses its built-in entry of the official module.
  await exec('pnpm', ['blacklight', 'add', 'http', '--registry', `${BASE}/no-registry`], game, env);
  expect(manifest().dependencies['@blacklight/module-http']).toBe(
    `${BASE}/blacklight-module-http-${VERSION}.tgz`,
  );
  await exec('pnpm', ['blacklight', 'add', '@blacklight/ui'], game);
  expect(manifest().dependencies['@blacklight/ui']).toBe(`${BASE}/blacklight-ui-${VERSION}.tgz`);

  await exec('pnpm', ['blacklight', 'upgrade', NEXT], game, env);
  const { dependencies, devDependencies } = manifest();
  for (const [name, spec] of Object.entries({ ...dependencies, ...devDependencies })) {
    if (name.startsWith('@blacklight/')) expect(spec).toMatch(new RegExp(`-${NEXT}\\.tgz$`));
  }
  expect(
    JSON.parse(readFileSync(join(game, 'node_modules/@blacklight/core/package.json'), 'utf8'))
      .version,
  ).toBe(NEXT);
  await exec('pnpm', ['build'], game);
});
