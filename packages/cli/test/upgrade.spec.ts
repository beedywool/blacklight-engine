import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { latestRelease, upgradeEngine } from '../src/commands/upgrade';

const OLD = 'https://github.com/beedywool/blacklight-engine/releases/download/v1.0.0';
const NEW = 'https://github.com/beedywool/blacklight-engine/releases/download/v1.1.0';
let root: string;

function write(manifest: unknown): void {
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
function read() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'blacklight-upgrade-'));
  writeFileSync(join(root, 'pnpm-lock.yaml'), '');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('blacklight upgrade', () => {
  it('moves the release tarballs to another version and reinstalls', async () => {
    write({
      name: 'g',
      dependencies: {
        '@blacklight/core': `${OLD}/blacklight-core-1.0.0.tgz`,
        '@blacklight/module-http': `${OLD}/blacklight-module-http-1.0.0.tgz`,
        vue: '3.5.44',
      },
      devDependencies: { '@blacklight/cli': `${OLD}/blacklight-cli-1.0.0.tgz` },
    });
    const runs: string[][] = [];
    const result = await upgradeEngine({
      root,
      version: 'v1.1.0',
      env: {},
      run: (command, args, cwd) => runs.push([command, ...args, cwd]),
    });
    expect(result.changes).toHaveLength(3);
    expect(read()).toEqual({
      name: 'g',
      dependencies: {
        '@blacklight/core': `${NEW}/blacklight-core-1.1.0.tgz`,
        '@blacklight/module-http': `${NEW}/blacklight-module-http-1.1.0.tgz`,
        vue: '3.5.44',
      },
      devDependencies: { '@blacklight/cli': `${NEW}/blacklight-cli-1.1.0.tgz` },
    });
    expect(runs).toEqual([['pnpm', 'install', root]]);
  });

  it('asks GitHub for the latest release and honours BLACKLIGHT_RELEASE_URL', async () => {
    write({ dependencies: { '@blacklight/core': `${OLD}/blacklight-core-1.0.0.tgz` } });
    const urls: string[] = [];
    const fake = (async (url: string) => {
      urls.push(url);
      return Response.json({ tag_name: 'v2.0.0' });
    }) as typeof fetch;
    await upgradeEngine({
      root,
      fetch: fake,
      install: false,
      env: { BLACKLIGHT_RELEASE_URL: 'http://127.0.0.1:9/rel' },
    });
    expect(urls).toEqual([
      'https://api.github.com/repos/beedywool/blacklight-engine/releases/latest',
    ]);
    expect(read().dependencies['@blacklight/core']).toBe(
      'http://127.0.0.1:9/rel/blacklight-core-2.0.0.tgz',
    );
    await expect(
      latestRelease((async () => new Response('', { status: 404 })) as typeof fetch),
    ).rejects.toThrow(/blacklight upgrade 1\.2\.0/);
  });

  it('explains what it cannot upgrade', async () => {
    write({ dependencies: { '@blacklight/core': 'link:/src/engine/packages/core' } });
    await expect(upgradeEngine({ root, version: '1.1.0', env: {} })).rejects.toThrow(
      /links the engine checkout/,
    );
    write({ dependencies: { '@blacklight/core': '^1.0.0' } });
    await expect(upgradeEngine({ root, version: '1.1.0', env: {} })).rejects.toThrow(
      /nothing to upgrade/,
    );
    await expect(upgradeEngine({ root, version: 'latest!', env: {} })).rejects.toThrow(
      /not a version/,
    );
    write({ dependencies: { '@blacklight/core': `${NEW}/blacklight-core-1.1.0.tgz` } });
    const result = await upgradeEngine({ root, version: '1.1.0', env: {}, run: () => {} });
    expect(result.changes).toEqual([]);
  });
});
