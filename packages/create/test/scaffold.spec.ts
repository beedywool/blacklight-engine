import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listTemplates, packageManagerFromAgent, packageName, scaffold } from '../src/scaffold';

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
  it('creates a standalone project with npm versions', () => {
    const dir = scaffold({
      dir: join(work, 'My Game'),
      template: 'empty',
      templatesDir,
      engineVersion: '1.2.3',
    });
    const pkg = manifest(dir);
    expect(pkg.name).toBe('my-game');
    expect(pkg.dependencies).toEqual({
      '@blacklight/core': '^1.2.3',
      '@blacklight/module-http': '^1.2.3',
      other: '1.0.0',
    });
    expect(pkg.devDependencies).toEqual({ '@blacklight/cli': '^1.2.3' });
    expect(existsSync(join(dir, '.gitignore'))).toBe(true);
    expect(existsSync(join(dir, 'node_modules'))).toBe(false);
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
