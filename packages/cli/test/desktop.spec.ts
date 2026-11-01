import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { signCommand } from '../src/commands/desktop';
import {
  OBFUSCATION_LEVELS,
  isGameChunk,
  resolvePixiUnsafeEval,
  withoutEmbindEval,
} from '../src/security';
import { desktopArches, desktopEntry, hostOs, unpackedDir } from '../src/targets/desktop';
import { capacitorConfig } from '../src/targets/mobile-native';
import { nativeEntry } from '../src/targets/natives';
import { runners } from '../src/targets/runners';
import { targets } from '../src/targets/index';

const fixture = resolve(import.meta.dirname, '../../../e2e/fixtures/desktop');

describe('desktop targets (PF-03, PF-05)', () => {
  it('registers win, mac, linux and steam builds and runners', () => {
    for (const target of ['win', 'mac', 'linux', 'steam']) {
      expect(targets[target], target).toBeTypeOf('function');
      expect(runners[target], target).toBeTypeOf('function');
    }
    expect(hostOs('win32')).toBe('win');
    expect(hostOs('darwin')).toBe('mac');
    expect(unpackedDir('/out', 'mac', 'arm64')).toBe(join('/out', 'mac-arm64'));
    expect(unpackedDir('/out', 'linux', 'x64')).toBe(join('/out', 'linux-unpacked'));
    // A Mac build ships both architectures; Steam builds the machine's own, natively.
    expect(desktopArches('mac', {}, 'arm64')).toEqual(['x64', 'arm64']);
    expect(desktopArches('mac', { steam: true }, 'arm64')).toEqual(['arm64']);
    expect(desktopArches('mac', { steam: true, arch: 'x64' }, 'arm64')).toEqual(['x64']);
    expect(desktopArches('linux', { steam: true }, 'x64')).toEqual(['x64']);
  });

  it('adds the desktop plugin to the generated entry only', () => {
    const plugin = desktopEntry('/engine/native/dist/index.js');
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string } | undefined;
    const entry = transform('const plugins = [ui()];', '/game/.blacklight/main.ts');
    expect(entry?.code).toContain(
      'import { desktop as __blacklightDesktop } from "/engine/native/dist/index.js"',
    );
    expect(entry?.code).toContain('const plugins = [__blacklightDesktop(), ui()];');
    expect(transform('const plugins = [];', '/game/scenes/a.ts')).toBeUndefined();
    expect(() => transform('nothing', '/game/.blacklight/main.ts')).toThrow(/no plugin list/);
  });

  it("finds the native parts of modules (the fixture's local echo module)", () => {
    expect(
      nativeEntry(fixture, {
        name: 'echo',
        source: join(fixture, 'modules/echo/echo.module.ts'),
        local: true,
      }),
    ).toBe(join(fixture, 'modules/echo/native.ts'));
    expect(
      nativeEntry(fixture, { name: 'none', source: '@blacklight/nothing', local: false }),
    ).toBeUndefined();
  });
});

describe('blacklight sign --dry-run (PF-07)', () => {
  it('reports unsigned builds without certificates', async () => {
    const lines = await signCommand(fixture, { dryRun: true }, {});
    expect(lines.join('\n')).toMatch(/win: Windows: unsigned[\s\S]*missing: WIN_CSC_LINK/);
    expect(lines.join('\n')).toMatch(/mac: macOS: unsigned/);
    expect(lines.join('\n')).toMatch(/linux: Linux packages are not signed/);
  });

  it('prints the signing and notarization steps with the certificates present, secrets masked', async () => {
    const env = {
      WIN_CSC_LINK: '/certs/game.pfx',
      WIN_CSC_KEY_PASSWORD: 'hunter2',
      CSC_LINK: '/certs/developer-id.p12',
      CSC_KEY_PASSWORD: 'hunter3',
      APPLE_API_KEY: '/certs/AuthKey.p8',
      APPLE_API_KEY_ID: 'KEYID',
      APPLE_API_ISSUER: 'issuer-uuid',
    };
    const text = (await signCommand(fixture, { dryRun: true }, env)).join('\n');
    expect(text).toContain('[dry-run] signtool sign /f "/certs/game.pfx" /p ******');
    expect(text).toContain('[dry-run] codesign --sign');
    expect(text).toContain('[dry-run] xcrun notarytool submit');
    expect(text).toContain('[dry-run] xcrun stapler staple');
    expect(text).not.toMatch(/hunter2|hunter3|issuer-uuid/);
    const mac = (await signCommand(fixture, { dryRun: true, target: 'mac' }, env)).join('\n');
    expect(mac).not.toContain('signtool');
    await expect(signCommand(fixture, { target: 'amiga', dryRun: true }, env)).rejects.toThrow(
      /win, mac or linux/,
    );
  });
});

describe('obfuscation (SEC-03; SEC-10 cost in obfuscation.timing.ts)', () => {
  it('obfuscates game chunks, not engine chunks', () => {
    const root = '/game';
    expect(
      isGameChunk(root, {
        '/game/scenes/a/a.scene.ts': { renderedLength: 900 },
        '/engine/core/dist/index.js': { renderedLength: 100 },
      }),
    ).toBe(true);
    expect(
      isGameChunk(root, {
        '/game/node_modules/pixi.js/lib/x.mjs': { renderedLength: 900 },
        '/game/game.config.ts': { renderedLength: 50 },
      }),
    ).toBe(false);
    expect(isGameChunk(root, { '/game/.blacklight/main.ts': { renderedLength: 10 } })).toBe(false);
    for (const options of Object.values(OBFUSCATION_LEVELS))
      expect(options.debugProtection).toBe(false);
  });
});

describe('SEC-07 switch on mobile builds', () => {
  it('turns WebView inspection off in release unless security.webview is false', () => {
    const game = {
      name: 'G',
      id: 'com.x.g',
      version: '1.0.0',
      resolution: { width: 640, height: 360 },
    };
    const debugging = (security: unknown, release: boolean) =>
      (
        capacitorConfig({ ...game, security } as never, { release, plugins: [] }).android as {
          webContentsDebuggingEnabled: boolean;
        }
      ).webContentsDebuggingEnabled;
    expect(debugging(undefined, true)).toBe(false);
    expect(debugging(undefined, false)).toBe(true);
    expect(debugging({ webview: false }, true)).toBe(true);
    expect(debugging(false, true)).toBe(true);
  });
});

describe('CSP and WebAssembly libraries (SEC-08)', () => {
  it("removes embind's `new Function` invokers from three's Basis transcoder (KTX2)", () => {
    const file = resolve(
      import.meta.dirname,
      '../../three/node_modules/three/examples/jsm/libs/basis/basis_transcoder.js',
    );
    const source = readFileSync(file, 'utf8');
    expect(source.match(/newFunc\(Function,/g)).toHaveLength(2);
    const patched = withoutEmbindEval(source);
    expect(patched).not.toMatch(/newFunc\(Function,/);
    expect(patched).toContain('var invokerFn=function(...invokeArgs)');
    expect(withoutEmbindEval('const a = 1;')).toBe('const a = 1;');
  });

  it("patches the Pixi copy the game bundles: the game's own first, else core's", () => {
    const from = (dir: string | undefined) =>
      Object.assign(
        (id: string) => {
          throw new Error(id);
        },
        {
          resolve: (id: string) => {
            if (!dir) throw new Error(`Cannot find module '${id}'`);
            return `${dir}/node_modules/pixi.js/lib/${id.split('/')[1]}/init.js`;
          },
        },
      ) as unknown as NodeJS.Require;
    expect(resolvePixiUnsafeEval(from('/game'), from('/core'))).toBe(
      '/game/node_modules/pixi.js/lib/unsafe-eval/init.mjs',
    );
    expect(resolvePixiUnsafeEval(from(undefined), from('/core'))).toBe(
      '/core/node_modules/pixi.js/lib/unsafe-eval/init.mjs',
    );
  });
});
