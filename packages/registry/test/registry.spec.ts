import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RegistryError,
  buildIndex,
  isLicenseAllowed,
  localPackuments,
  moduleNameOf,
  npmPackuments,
  releaseTarballs,
  validateIndex,
  validateManifest,
  validatePackage,
  type ModuleDetail,
  type Packument,
  type PackageJson,
  type RegistryIndex,
} from '../src/index';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-registry-'));
  dirs.push(dir);
  return dir;
}

function pkg(name: string, module: string, extra: Partial<PackageJson> = {}): PackageJson {
  return {
    name,
    version: '1.0.0',
    description: `The ${module} module.`,
    license: 'MIT',
    keywords: ['blacklight-module'],
    blacklight: { module, engine: '^1.0.0', platforms: ['web'], permissions: ['network'] },
    ...extra,
  };
}

function packuments(...list: PackageJson[][]): (name: string) => Promise<Packument | undefined> {
  return async (name) => {
    const versions = list.find((v) => v[0]!.name === name);
    if (!versions) return undefined;
    return {
      name,
      'dist-tags': { latest: versions.at(-1)!.version! },
      versions: Object.fromEntries(versions.map((v) => [v.version!, v])),
    };
  };
}

function entries(list: Record<string, unknown>[]): string {
  const dir = join(temp(), 'entries');
  mkdirSync(dir);
  for (const entry of list) {
    writeFileSync(
      join(dir, `${String(entry.file ?? entry.name)}.json`),
      JSON.stringify({ ...entry, file: undefined }),
    );
  }
  return dir;
}

describe('manifest', () => {
  it('accepts a valid package and names', () => {
    expect(validatePackage(pkg('blacklight-module-chat', 'chat'))).toEqual([]);
    expect(moduleNameOf('@blacklight/module-sqlite')).toBe('sqlite');
    expect(moduleNameOf('@me/blacklight-module-chat')).toBe('chat');
    expect(moduleNameOf('chat')).toBeUndefined();
  });

  it('reports every problem with a fix', () => {
    const issues = validatePackage({
      name: 'chat-module',
      version: 'one',
      license: 'GPL-3.0',
      private: true,
      blacklight: {
        module: 'Chat',
        engine: 'whenever',
        platforms: ['web', 'web', 'switch'],
        permissions: ['netwrok'],
        dependencies: ['Chat'],
        extra: 1,
      },
    });
    expect(issues).toEqual([
      'the package name "chat-module" must be `blacklight-module-<name>` or `@scope/blacklight-module-<name>` (lowercase, e.g. "blacklight-module-chat")',
      '`version` must be a semver version, e.g. "1.0.0"',
      '`description` is required: one sentence shown by `blacklight search`',
      '`license` must be MIT-compatible (MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, Zlib, 0BSD, CC0-1.0), got "GPL-3.0"',
      '`private: true` prevents publishing; remove it',
      '`blacklight.module` must be the module name: lowercase letters, digits and dashes, starting with a letter (e.g. "high-scores")',
      '`blacklight.engine` must be a semver range of compatible @blacklight/core versions, e.g. "^1.0.0"',
      '`blacklight.platforms` lists "web" twice; remove the duplicate',
      '`blacklight.platforms` contains "switch", which is not one of: web, desktop, android, ios.',
      '`blacklight.permissions` contains "netwrok", which is not one of: network, storage, native, accounts, telemetry. Did you mean "network"?',
      '`blacklight.dependencies` contains "Chat", which is not a module name',
      '`blacklight.extra` is not a manifest field. Known fields: module, engine, platforms, permissions, dependencies.',
    ]);
    expect(validateManifest(undefined)[0]).toMatch(/no `blacklight` manifest/);
    expect(validatePackage(pkg('blacklight-module-chat', 'talk'))).toEqual([
      '`blacklight.module` is "talk" but the package name says "chat"; make them equal',
    ]);
  });

  it('checks SPDX expressions', () => {
    expect(isLicenseAllowed('MIT')).toBe(true);
    expect(isLicenseAllowed('(MIT OR GPL-3.0)')).toBe(true);
    expect(isLicenseAllowed('MIT AND GPL-3.0')).toBe(false);
    expect(isLicenseAllowed('Apache-2.0 AND BSD-3-Clause')).toBe(true);
    expect(isLicenseAllowed('UNLICENSED')).toBe(false);
  });
});

describe('index', () => {
  const chat = [
    pkg('blacklight-module-chat', 'chat', {
      version: '0.9.0',
      blacklight: { module: 'chat', engine: '^0.9.0', platforms: ['web'], permissions: [] },
    }),
    pkg('blacklight-module-chat', 'chat', {
      blacklight: {
        module: 'chat',
        engine: '^1.0.0',
        platforms: ['web', 'desktop'],
        permissions: ['network'],
        dependencies: ['http'],
      },
    }),
  ];
  const http = [
    pkg('@blacklight/module-http', 'http', {
      repository: { url: 'git+https://github.com/x/http.git' },
    }),
  ];

  it('builds the static API from entries and npm data', async () => {
    const dir = entries([
      { name: 'chat', package: 'blacklight-module-chat', repository: 'https://github.com/me/chat' },
      { name: 'http', package: '@blacklight/module-http', official: true },
    ]);
    const out = temp();
    const index = await buildIndex(dir, out, {
      packument: packuments(chat, http),
      now: new Date('2026-10-29T00:00:00Z'),
    });
    expect(index.modules.map((m) => m.name)).toEqual(['chat', 'http']);
    const written = JSON.parse(readFileSync(join(out, 'v1/index.json'), 'utf8')) as RegistryIndex;
    expect(written).toEqual(index);
    expect(written.modules[0]).toEqual({
      name: 'chat',
      package: 'blacklight-module-chat',
      version: '1.0.0',
      description: 'The chat module.',
      keywords: ['blacklight-module'],
      platforms: ['web', 'desktop'],
      permissions: ['network'],
      engine: '^1.0.0',
      dependencies: ['http'],
      official: false,
      repository: 'https://github.com/me/chat',
      license: 'MIT',
    });
    expect(written.modules[1]!.repository).toBe('https://github.com/x/http');
    const detail = JSON.parse(
      readFileSync(join(out, 'v1/modules/chat.json'), 'utf8'),
    ) as ModuleDetail;
    expect(Object.keys(detail.versions)).toEqual(['0.9.0', '1.0.0']);
    expect(detail.versions['0.9.0']).toEqual({
      engine: '^0.9.0',
      platforms: ['web'],
      permissions: [],
      dependencies: [],
    });
  });

  it('lists every problem of an index', async () => {
    const dir = entries([
      { name: 'chat', package: 'blacklight-module-chat' },
      { file: 'talk', name: 'chat2', package: 'blacklight-module-talk' },
      { name: 'ghost', package: 'blacklight-module-ghost' },
      { name: 'bad', package: 'blacklight-module-bad' },
      { name: 'odd', package: 'lodash', extra: true },
    ]);
    writeFileSync(join(dir, 'broken.json'), '{');
    const issues = await validateIndex(dir, {
      packument: packuments(chat, [pkg('blacklight-module-bad', 'bad', { license: 'GPL-3.0' })]),
    });
    expect(issues).toEqual([
      expect.stringMatching(/^entries\/broken.json is not valid JSON/),
      'entries/odd.json: `package` must be "blacklight-module-odd" or "@scope/blacklight-module-odd"',
      'entries/odd.json: unknown field `extra` (known: name, package, repository, official)',
      'entries/talk.json: `name` must equal the file name ("talk")',
      expect.stringMatching(
        /^entries\/bad.json: blacklight-module-bad@1.0.0: `license` must be MIT-compatible/,
      ),
      'entries/ghost.json: blacklight-module-ghost is not published on npm; publish it before adding the entry',
      'entries/chat.json: depends on the module "http", which has no entry in the index; add it first',
    ]);
    await expect(buildIndex(dir, temp(), { packument: packuments(chat) })).rejects.toBeInstanceOf(
      RegistryError,
    );
  });

  it('refuses a package listed twice', async () => {
    const dir = entries([
      { name: 'http', package: '@blacklight/module-http' },
      { name: 'chat', package: 'blacklight-module-chat' },
    ]);
    writeFileSync(
      join(dir, 'zz.json'),
      JSON.stringify({ name: 'zz', package: 'blacklight-module-zz' }),
    );
    expect(
      await validateIndex(dir, {
        packument: packuments(chat, http, [pkg('blacklight-module-zz', 'chat')]),
      }),
    ).toEqual([
      'entries/zz.json: blacklight-module-zz@1.0.0: `blacklight.module` is "chat" but the package name says "zz"; make them equal',
    ]);
  });

  it('reads local package folders and the official index', async () => {
    const modules = resolve(import.meta.dirname, '../../modules');
    const out = temp();
    const index = await buildIndex(resolve(import.meta.dirname, '../index/entries'), out, {
      packument: localPackuments([modules]),
    });
    expect(index.modules.map((m) => m.name)).toEqual([
      'accounts-oidc',
      'achievements',
      'cloud-save',
      'http',
      'sqlite',
      'telemetry',
    ]);
    expect(index.modules.every((m) => m.official)).toBe(true);
    expect(index.modules.every((m) => m.tarball === undefined)).toBe(true);
  });

  it('points modules at release tarballs', async () => {
    const modules = resolve(import.meta.dirname, '../../modules');
    const out = temp();
    const base = 'https://github.com/beedywool/blacklight-engine/releases/download/v1.2.0/';
    const index = await buildIndex(resolve(import.meta.dirname, '../index/entries'), out, {
      packument: localPackuments([modules]),
      tarball: releaseTarballs(base, (name) => name !== '@blacklight/module-telemetry'),
    });
    const http = index.modules.find((m) => m.name === 'http')!;
    expect(http.tarball).toBe(`${base}blacklight-module-http-${http.version}.tgz`);
    expect(index.modules.find((m) => m.name === 'telemetry')!.tarball).toBeUndefined();
    const detail = JSON.parse(readFileSync(join(out, 'v1/modules/http.json'), 'utf8'));
    expect(detail.tarball).toBe(http.tarball);
    expect(detail.versions[http.version].tarball).toBe(http.tarball);
  });

  it('asks npm for scoped packages with an encoded slash', async () => {
    const urls: string[] = [];
    const source = npmPackuments({
      fetch: (async (url: string) => {
        urls.push(url);
        return new Response('{}', { status: url.includes('missing') ? 404 : 200 });
      }) as typeof fetch,
    });
    expect(await source('blacklight-module-missing')).toBeUndefined();
    await source('@blacklight/module-http');
    expect(urls).toEqual([
      'https://registry.npmjs.org/blacklight-module-missing',
      'https://registry.npmjs.org/@blacklight%2Fmodule-http',
    ]);
  });
});
