import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex, localPackuments, releaseTarballs } from '@blacklight/registry';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  addEnginePackage,
  addModule,
  addToConfig,
  formatModules,
  publishModule,
  searchModules,
} from '../src/commands/registry';

const dirs: string[] = [];
let server: Server;
let registry: string;
/** The same modules, installed from release tarballs instead of npm. */
let tarballRegistry: string;
/** A host without a registry: every file is a 404. */
let noRegistry: string;
let checkout: string;

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-registry-cli-'));
  dirs.push(dir);
  return dir;
}

function writeJson(file: string, data: unknown): void {
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function modulePackage(name: string, extra: Record<string, unknown> = {}) {
  return {
    name: `@blacklight/module-${name}`,
    version: '1.2.0',
    description: `The ${name} module.`,
    license: 'MIT',
    keywords: ['blacklight-module', name],
    exports: { '.': './dist/index.js' },
    blacklight: {
      module: name,
      engine: '^1.0.0',
      platforms: ['web', 'desktop'],
      permissions: ['storage'],
      ...extra,
    },
  };
}

beforeAll(async () => {
  // A fake engine checkout with three modules, and a static registry built from it.
  checkout = temp();
  writeJson(join(checkout, 'packages/core/package.json'), {
    name: '@blacklight/core',
    version: '1.4.0',
  });
  writeJson(
    join(checkout, 'packages/modules/http/package.json'),
    modulePackage('http', { permissions: ['network'] }),
  );
  writeJson(join(checkout, 'packages/modules/sqlite/package.json'), modulePackage('sqlite'));
  writeJson(
    join(checkout, 'packages/modules/cloud-save/package.json'),
    modulePackage('cloud-save', { dependencies: ['http'], permissions: ['network', 'storage'] }),
  );
  writeJson(
    join(checkout, 'packages/modules/future/package.json'),
    modulePackage('future', { engine: '^2.0.0' }),
  );
  const entries = join(checkout, 'index/entries');
  for (const name of ['http', 'sqlite', 'cloud-save', 'future']) {
    writeJson(join(entries, `${name}.json`), {
      name,
      package: `@blacklight/module-${name}`,
      official: true,
    });
  }
  const site = join(checkout, 'site');
  await buildIndex(entries, site, {
    packument: localPackuments([join(checkout, 'packages/modules')]),
  });
  await buildIndex(entries, join(checkout, 'site-tarballs'), {
    packument: localPackuments([join(checkout, 'packages/modules')]),
    tarball: releaseTarballs('https://example.com/rel/v1.2.0'),
  });
  server = createServer((req, res) => {
    try {
      const body = readFileSync(join(checkout, decodeURIComponent(req.url ?? '/')));
      res.writeHead(200, { 'content-type': 'application/json' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const host = `http://localhost:${(server.address() as AddressInfo).port}`;
  registry = `${host}/site`;
  tarballRegistry = `${host}/site-tarballs`;
  noRegistry = `${host}/nothing`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  for (const dir of dirs.splice(1)) rmSync(dir, { recursive: true, force: true });
});

const CONFIG = `import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: 'My Game',
  id: 'com.example.mygame',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080, mode: 'extend' },
});
`;

/** A game; `linked` uses the fake checkout like `create-blacklight --link`. */
function game({ linked = true, core = '1.4.0', release = '' } = {}): string {
  const root = temp();
  writeFileSync(join(root, 'game.config.ts'), CONFIG);
  writeJson(join(root, 'package.json'), {
    name: 'my-game',
    dependencies: {
      '@blacklight/core': release
        ? `${release}/blacklight-core-${core}.tgz`
        : linked
          ? `link:${join(checkout, 'packages', 'core')}`
          : `^${core}`,
    },
  });
  writeFileSync(join(root, 'pnpm-lock.yaml'), '');
  writeJson(join(root, 'node_modules/@blacklight/core/package.json'), {
    name: '@blacklight/core',
    version: core,
  });
  return root;
}

describe('addToConfig', () => {
  it('adds a modules object as the last property', () => {
    expect(addToConfig(CONFIG, 'sqlite')).toBe(
      CONFIG.replace("mode: 'extend' },\n", "mode: 'extend' },\n  modules: { sqlite: {} },\n"),
    );
    expect(addToConfig("export default defineConfig({ name: 'G' });", 'http')).toBe(
      "export default defineConfig({ name: 'G', modules: { http: {} } });",
    );
    expect(addToConfig('export default defineConfig({\n  name: "G"\n});\n', 'http')).toBe(
      'export default defineConfig({\n  name: "G",\n  modules: { http: {} },\n});\n',
    );
  });

  it('extends an existing modules object and quotes dashed names', () => {
    const one = addToConfig(CONFIG, 'http')!;
    const two = addToConfig(one, 'accounts-oidc')!;
    expect(two).toContain("modules: { http: {}, 'accounts-oidc': {} },");
    expect(addToConfig(two, 'accounts-oidc')).toBe(two);
    expect(addToConfig(two, 'http')).toBe(two);
    const multi =
      'defineConfig({\n  modules: {\n    http: { baseUrl: "https://x.y/{}" },\n  },\n});';
    expect(addToConfig(multi, 'sqlite')).toBe(
      'defineConfig({\n  modules: {\n    http: { baseUrl: "https://x.y/{}" },\n    sqlite: {},\n  },\n});',
    );
  });

  it('gives up on files it cannot read safely', () => {
    expect(addToConfig('module.exports = config;', 'http')).toBeUndefined();
  });
});

describe('blacklight add', () => {
  it('installs a linked module and its dependencies, then configures them', async () => {
    const root = game();
    const runs: string[][] = [];
    const lines: string[] = [];
    const result = await addModule({
      root,
      name: 'cloud-save',
      registry,
      run: (command, args) => void runs.push([command, ...args]),
      log: (line) => lines.push(line),
    });
    expect(result.modules.map((m) => m.name)).toEqual(['http', 'cloud-save']);
    expect(runs).toEqual([
      [
        'pnpm',
        'add',
        `@blacklight/module-http@link:${join(checkout, 'packages/modules/http')}`,
        `@blacklight/module-cloud-save@link:${join(checkout, 'packages/modules/cloud-save')}`,
      ],
    ]);
    expect(readFileSync(join(root, 'game.config.ts'), 'utf8')).toContain(
      "modules: { http: {}, 'cloud-save': {} },",
    );
    expect(lines.join('\n')).toContain(
      'cloud-save (@blacklight/module-cloud-save 1.2.0) - platforms: web, desktop; permissions: network, storage',
    );
  });

  it('installs the registry version of a published module', async () => {
    const root = game({ linked: false });
    const runs: string[][] = [];
    await addModule({ root, name: 'sqlite', registry, run: (c, a) => void runs.push([c, ...a]) });
    expect(runs).toEqual([['pnpm', 'add', '@blacklight/module-sqlite@1.2.0']]);
  });

  it('installs official modules from the engine release of the game', async () => {
    const release = 'https://github.com/beedywool/blacklight-engine/releases/download/v1.4.0';
    const root = game({ release });
    const runs: string[][] = [];
    await addModule({
      root,
      name: 'cloud-save',
      registry,
      run: (c, a) => void runs.push([c, ...a]),
    });
    expect(runs).toEqual([
      [
        'pnpm',
        'add',
        `@blacklight/module-http@${release}/blacklight-module-http-1.4.0.tgz`,
        `@blacklight/module-cloud-save@${release}/blacklight-module-cloud-save-1.4.0.tgz`,
      ],
    ]);
  });

  it('installs the tarball a registry entry points at', async () => {
    const root = game({ linked: false });
    const runs: string[][] = [];
    await addModule({
      root,
      name: 'sqlite',
      registry: tarballRegistry,
      run: (c, a) => void runs.push([c, ...a]),
    });
    expect(runs).toEqual([
      [
        'pnpm',
        'add',
        '@blacklight/module-sqlite@https://example.com/rel/v1.2.0/blacklight-module-sqlite-1.2.0.tgz',
      ],
    ]);
  });

  it('adds engine packages from the release or the checkout of the game', () => {
    const release = 'https://github.com/beedywool/blacklight-engine/releases/download/v1.4.0';
    const runs: string[][] = [];
    const run = (c: string, a: string[]) => void runs.push([c, ...a]);
    addEnginePackage({ root: game({ release }), name: '@blacklight/ui', run });
    addEnginePackage({ root: game(), name: 'three', run });
    expect(runs).toEqual([
      ['pnpm', 'add', `@blacklight/ui@${release}/blacklight-ui-1.4.0.tgz`],
      [
        'pnpm',
        'add',
        `@blacklight/three@link:${join(checkout, 'packages/three').replaceAll('\\', '/')}`,
      ],
    ]);
    expect(() => addEnginePackage({ root: game(), name: '@blacklight/nope', run })).toThrow(
      /not an engine package/,
    );
    expect(() =>
      addEnginePackage({ root: game({ linked: false }), name: '@blacklight/ui', run }),
    ).toThrow(/neither from an engine release nor from a checkout/);
  });

  it('tells which configuration fields a module needs', async () => {
    const lines: string[] = [];
    const result = await addModule({
      root: game({ linked: false }),
      name: 'accounts-oidc',
      registry: noRegistry,
      install: false,
      log: (line) => lines.push(line),
    });
    expect(result.configured).toEqual(['http', 'accounts-oidc']);
    expect(lines[0]).toMatch(/has no module registry/);
    expect(lines.at(-1)).toContain(
      "add `issuer: 'https://your-provider', clientId: 'your-client-id'` to modules['accounts-oidc'] in game.config.ts",
    );
  });

  it('refuses an incompatible engine unless forced', async () => {
    const root = game();
    await expect(addModule({ root, name: 'future', registry, install: false })).rejects.toThrow(
      'The "future" module 1.2.0 supports @blacklight/core ^2.0.0, but this game uses 1.4.0. Upgrade the engine',
    );
    const result = await addModule({ root, name: 'future', registry, install: false, force: true });
    expect(result.configured).toEqual(['future']);
  });

  it('suggests names for unknown modules', async () => {
    await expect(
      addModule({ root: game(), name: 'sqlit', registry, install: false }),
    ).rejects.toThrow('There is no module named "sqlit" in the registry. Did you mean "sqlite"?');
  });

  it('falls back to built-in entries of official modules offline', async () => {
    const root = game({ linked: false });
    const runs: string[][] = [];
    const lines: string[] = [];
    const result = await addModule({
      root,
      name: 'achievements',
      registry: 'http://localhost:1',
      run: (c, a) => void runs.push([c, ...a]),
      log: (line) => lines.push(line),
    });
    expect(runs).toEqual([
      ['pnpm', 'add', '@blacklight/module-http', '@blacklight/module-achievements'],
    ]);
    expect(result.configured).toEqual(['http', 'achievements']);
    expect(lines[0]).toMatch(/Cannot reach the module registry/);
    await expect(
      addModule({ root, name: 'unknown-thing', registry: 'http://localhost:1', install: false }),
    ).rejects.toThrow(/Cannot reach the module registry/);
  });

  it('explains what to do outside a game folder', async () => {
    await expect(
      addModule({ root: temp(), name: 'http', registry, install: false }),
    ).rejects.toThrow(/No game.config.ts.*create-blacklight\.tgz my-game/);
  });
});

describe('blacklight search', () => {
  it('filters by name, description and keywords and prints a table', async () => {
    const found = await searchModules({ registry, query: 'SQL' });
    expect(found.map((m) => m.name)).toEqual(['sqlite']);
    expect((await searchModules({ registry })).length).toBe(4);
    expect(formatModules(found)).toBe(
      [
        'NAME               VERSION  PLATFORMS    DESCRIPTION',
        'sqlite (official)  1.2.0    web,desktop  The sqlite module.',
      ].join('\n'),
    );
    expect(formatModules([])).toBe('No module found.');
  });
});

describe('blacklight publish', () => {
  it('lists every problem of the package', async () => {
    const dir = temp();
    writeJson(join(dir, 'package.json'), { name: 'my-chat', version: '1.0.0', license: 'GPL-3.0' });
    await expect(publishModule({ dir, dryRun: true })).rejects.toThrow(
      /my-chat cannot be published as a Blacklight module:\n {2}- the package name "my-chat"[\s\S]*license[\s\S]*no `blacklight` manifest/,
    );
  });

  it('asks for a build, then prints the command and the index entry', async () => {
    const dir = temp();
    writeJson(join(dir, 'package.json'), {
      ...modulePackage('chat'),
      name: 'blacklight-module-chat',
      repository: { url: 'git+https://github.com/me/chat.git' },
    });
    await expect(publishModule({ dir, dryRun: true })).rejects.toThrow(
      './dist/index.js does not exist: build the module first',
    );
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/index.js'), '');
    const lines: string[] = [];
    const runs: string[][] = [];
    const { entry } = await publishModule({
      dir,
      dryRun: true,
      log: (l) => lines.push(l),
      run: (c, a) => void runs.push([c, ...a]),
    });
    expect(runs).toEqual([]);
    expect(entry).toEqual({
      name: 'chat',
      package: 'blacklight-module-chat',
      repository: 'https://github.com/me/chat',
    });
    expect(lines[0]).toBe(`Dry run: would run \`npm publish --access public\` in ${dir}.`);
    expect(lines[1]).toContain('entries/chat.json');
    await publishModule({ dir, run: (c, a) => void runs.push([c, ...a]) });
    expect(runs).toEqual([['npm', 'publish', '--access', 'public']]);
  });
});
