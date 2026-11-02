// DOC-07: what the release workflow packs. The end-to-end check (pack, serve, create, install,
// build) is e2e/release.spec.ts.
import { describe, expect, it } from 'vitest';
import { assetName, publishedPackages, releaseBase, releaseManifest } from './release-pack.mjs';

describe('release-pack', () => {
  it('publishes every non-private package, the extension apart', () => {
    const names = publishedPackages().map((dir) => dir.split(/[\\/]/).slice(-2).join('/'));
    expect(names).toContain('packages/core');
    expect(names).toContain('packages/create');
    expect(names).toContain('modules/accounts-oidc');
    expect(names).toContain('servers/relay');
    expect(names).not.toContain('packages/vscode');
    expect(names).not.toContain('servers/reference');
    expect(names).toHaveLength(18);
  });

  it('names assets like pnpm pack, under the GitHub release of the tag', () => {
    expect(assetName('@blacklight/module-http', '1.2.0')).toBe('blacklight-module-http-1.2.0.tgz');
    expect(releaseBase('1.2.0')).toBe(
      'https://github.com/beedywool/blacklight-engine/releases/download/v1.2.0',
    );
  });

  it('points engine dependencies at the same release', () => {
    const manifest = {
      name: '@blacklight/cli',
      version: '0.0.0',
      dependencies: { '@blacklight/registry': 'workspace:*', cac: '7.1.0' },
      peerDependencies: { '@blacklight/core': 'workspace:*' },
      devDependencies: { '@blacklight/native': 'workspace:*', tsup: '9.0.0' },
    };
    const out = releaseManifest(manifest, { version: '1.2.0', baseUrl: 'http://h/rel/' });
    expect(out).toEqual({
      name: '@blacklight/cli',
      version: '1.2.0',
      // pnpm refuses URL dependencies below the top level (blockExoticSubdeps); a peer with a URL
      // is installed from it like a direct dependency of the game.
      dependencies: { cac: '7.1.0' },
      peerDependencies: {
        '@blacklight/core': '^1.2.0',
        '@blacklight/registry': 'http://h/rel/blacklight-registry-1.2.0.tgz',
      },
      devDependencies: { tsup: '9.0.0' },
    });
    expect(manifest.version).toBe('0.0.0');
  });
});
