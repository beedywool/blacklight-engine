import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  listTemplates,
  packageManagerFromAgent,
  packageName,
  releaseAssetName,
  releaseBaseUrl,
  retargetRelease,
  scaffold,
} from '../src/scaffold';

let work: string;
let templatesDir: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'create-blacklight-'));
  templatesDir = join(work, 'templates');
  const empty = join(templatesDir, 'empty');
  mkdirSync(join(empty, 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(empty, '_gitignore'), 'node_modules/\n');
  writeFileSync(
    join(empty, 'package.json'),
    JSON.stringify({
      name: 'blacklight-template-empty',
      dependencies: {
        '@blacklight/core': 'workspace:*',
        '@blacklight/module-http': 'workspace:*',
        other: '1.0.0',
      },
      devDependencies: { '@blacklight/cli': 'workspace:*' },
    }),
  );
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

function manifest(dir: string) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

describe('scaffold', () => {
  it('creates a standalone project that depends on the release tarballs', () => {
    const dir = scaffold({
      dir: join(work, 'My Game'),
      template: 'empty',
      templatesDir,
      engineVersion: '1.2.3',
    });
    const pkg = manifest(dir);
    const base = 'https://github.com/beedywool/blacklight-engine/releases/download/v1.2.3';
    expect(pkg.name).toBe('my-game');
    expect(pkg.dependencies).toEqual({
      '@blacklight/core': `${base}/blacklight-core-1.2.3.tgz`,
      '@blacklight/module-http': `${base}/blacklight-module-http-1.2.3.tgz`,
      other: '1.0.0',
    });
    expect(pkg.devDependencies).toEqual({ '@blacklight/cli': `${base}/blacklight-cli-1.2.3.tgz` });
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules'))).toBe(false);
  });

  it('takes the release folder from releaseUrl', () => {
    const dir = scaffold({
      dir: join(work, 'local'),
      template: 'empty',
      templatesDir,
      engineVersion: '2.0.0-rc.1',
      releaseUrl: 'http://127.0.0.1:4873/',
    });
    expect(manifest(dir).devDependencies).toEqual({
      '@blacklight/cli': 'http://127.0.0.1:4873/blacklight-cli-2.0.0-rc.1.tgz',
    });
  });

  it('links a local engine checkout', () => {
    const dir = scaffold({
      dir: join(work, 'g'),
      template: 'empty',
      templatesDir,
      engineVersion: '0.0.0',
      link: '/src/engine',
    });
    const deps = manifest(dir).dependencies;
    // `/src/engine` is `D:/src/engine` on Windows.
    const engine = resolve('/src/engine').replaceAll('\\', '/');
    expect(deps['@blacklight/core']).toBe(`link:${engine}/packages/core`);
    expect(deps['@blacklight/module-http']).toBe(`link:${engine}/packages/modules/http`);
  });

  it('refuses unknown templates and non-empty folders', () => {
    expect(() =>
      scaffold({ dir: join(work, 'a'), template: 'nope', templatesDir, engineVersion: '0.0.0' }),
    ).toThrow(/Available templates: empty/);
    expect(() =>
      scaffold({ dir: templatesDir, template: 'empty', templatesDir, engineVersion: '0.0.0' }),
    ).toThrow(/--force/);
  });
});

describe('helpers', () => {
  it('lists templates and sanitizes names', () => {
    expect(listTemplates(templatesDir)).toEqual(['empty']);
    expect(packageName('/tmp/Super Party!')).toBe('super-party');
  });
});

describe('packageManagerFromAgent', () => {
  it('reads the pnpm version running the scaffolder', () => {
    expect(packageManagerFromAgent('pnpm/12.16.1 npm/? node/v24.1.0 linux x64')).toBe(
      'pnpm@12.16.1',
    );
    expect(packageManagerFromAgent('npm/10.0.0 node/v24.1.0')).toBeUndefined();
    expect(packageManagerFromAgent(undefined)).toBeUndefined();
  });
});

describe('release URLs', () => {
  it('names assets like pnpm pack and reads BLACKLIGHT_RELEASE_URL', () => {
    expect(releaseAssetName('@blacklight/module-cloud-save', 'v1.0.0')).toBe(
      'blacklight-module-cloud-save-1.0.0.tgz',
    );
    expect(releaseAssetName('create-blacklight', '1.0.0')).toBe('create-blacklight-1.0.0.tgz');
    expect(releaseBaseUrl('v1.0.0', {})).toBe(
      'https://github.com/beedywool/blacklight-engine/releases/download/v1.0.0',
    );
    expect(releaseBaseUrl('1.0.0', { BLACKLIGHT_RELEASE_URL: 'http://localhost:9/rel/' })).toBe(
      'http://localhost:9/rel',
    );
  });

  it('retargets release dependencies and leaves the others alone', () => {
    const old = 'https://github.com/beedywool/blacklight-engine/releases/download/v1.0.0';
    const pkg = {
      dependencies: {
        '@blacklight/core': `${old}/blacklight-core-1.0.0.tgz`,
        '@blacklight/module-http': `${old}/blacklight-module-http-1.0.0-beta.2.tgz`,
        '@blacklight/ui': 'link:/src/engine/packages/ui',
        '@blacklight/three': '^1.0.0',
        vue: '3.5.44',
        // Not the tarball of this package: left alone.
        '@blacklight/net': `${old}/blacklight-core-1.0.0.tgz`,
      },
      devDependencies: { '@blacklight/cli': `${old}/blacklight-cli-1.0.0.tgz` },
    };
    const base = releaseBaseUrl('1.1.0', {});
    const changes = retargetRelease(pkg, '1.1.0', base);
    expect(changes.map((c) => c.name)).toEqual([
      '@blacklight/core',
      '@blacklight/module-http',
      '@blacklight/cli',
    ]);
    expect(pkg.dependencies['@blacklight/core']).toBe(`${base}/blacklight-core-1.1.0.tgz`);
    expect(pkg.dependencies['@blacklight/module-http']).toBe(
      `${base}/blacklight-module-http-1.1.0.tgz`,
    );
    expect(pkg.devDependencies['@blacklight/cli']).toBe(`${base}/blacklight-cli-1.1.0.tgz`);
    expect(pkg.dependencies['@blacklight/ui']).toBe('link:/src/engine/packages/ui');
    expect(pkg.dependencies['@blacklight/three']).toBe('^1.0.0');
    expect(pkg.dependencies['@blacklight/net']).toBe(`${old}/blacklight-core-1.0.0.tgz`);
    // Same release again: nothing to change.
    expect(retargetRelease(pkg, '1.1.0', base)).toEqual([]);
  });
});
