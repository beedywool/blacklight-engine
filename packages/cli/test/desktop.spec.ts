import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { signCommand } from '../src/commands/desktop';
import {
  OBFUSCATION_LEVELS,
  isGameChunk,
  obfuscate,
  resolvePixiUnsafeEval,
  withoutEmbindEval,
} from '../src/security';
import { desktopEntry, hostOs, unpackedDir } from '../src/targets/desktop';
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

describe('obfuscation (SEC-03, SEC-10)', () => {
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

  /**
   * The reference benchmark: game logic of the kind scenes run every step (300 objects moving,
   * bouncing, colliding, scoring), plain and obfuscated. SEC-10 allows 10 % at the default level.
   */
  const WORKLOAD = `
    function makeObjects(count) {
      const objects = [];
      for (let i = 0; i < count; i++) {
        objects.push({ id: i, x: (i * 37) % 640, y: (i * 53) % 360, vx: (i % 7) - 3, vy: (i % 5) - 2, hp: 100, score: 0, tag: i % 3 === 0 ? 'enemy' : 'coin' });
      }
      return objects;
    }
    function step(objects) {
      for (const o of objects) {
        o.x += o.vx; o.y += o.vy;
        if (o.x < 0 || o.x > 640) o.vx = -o.vx;
        if (o.y < 0 || o.y > 360) o.vy = -o.vy;
      }
      const cell = new Map();
      for (const o of objects) {
        const key = ((o.x / 32) | 0) + ':' + ((o.y / 32) | 0);
        let list = cell.get(key);
        if (!list) cell.set(key, (list = []));
        list.push(o);
      }
      let hits = 0;
      for (const list of cell.values()) {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          if (Math.abs(a.x - b.x) < 8 && Math.abs(a.y - b.y) < 8) {
            hits++;
            if (a.tag === 'enemy') b.hp -= 1; else a.score += 10;
          }
        }
      }
      return hits;
    }
    function run(steps) {
      const objects = makeObjects(300);
      let total = 0;
      for (let s = 0; s < steps; s++) total += step(objects);
      return total;
    }
  `;

  /** The workload's `run`, compiled and warmed up (JIT). */
  function compile(source: string): (steps: number) => number {
    const run = new Function(`${source}; return run;`)() as (steps: number) => number;
    run(200);
    return run;
  }

  /**
   * Median over 15 rounds of `variant` time / `plain` time, both timed back to back in each round
   * (in alternating order): a busy neighbour (the other test files run in parallel) slows both
   * sides of a round alike instead of one whole series. The rounds start after both sides have
   * run for 3 s: V8 optimises hot functions on a background thread, and on a busy CI runner that
   * thread finishes seconds late, so early rounds time the variant's unoptimised code (×1.27 for
   * code that costs ×1.02 once optimised, with `--concurrent-recompilation-delay=1500`).
   */
  function slowdown(
    plain: (steps: number) => number,
    variant: (steps: number) => number,
  ): { ratio: number; plainMs: number; ratios: number[] } {
    const time = (run: (steps: number) => number) => {
      const start = performance.now();
      run(600);
      return performance.now() - start;
    };
    const warmUpEnd = performance.now() + 3000;
    for (let i = 0; i < 10 || performance.now() < warmUpEnd; i++) {
      time(plain);
      time(variant);
    }
    const ratios: number[] = [];
    const plainTimes: number[] = [];
    for (let i = 0; i < 15; i++) {
      let plainMs: number;
      let variantMs: number;
      if (i % 2) {
        variantMs = time(variant);
        plainMs = time(plain);
      } else {
        plainMs = time(plain);
        variantMs = time(variant);
      }
      ratios.push(variantMs / plainMs);
      plainTimes.push(plainMs);
    }
    const median = (values: number[]) => [...values].sort((x, y) => x - y)[values.length >> 1]!;
    return { ratio: median(ratios), plainMs: median(plainTimes), ratios };
  }

  it(
    'costs at most 10 % at the default level (low), same results',
    { timeout: 120_000 },
    async () => {
      const plain = compile(WORKLOAD);
      const low = compile(await obfuscate(WORKLOAD, 'low'));
      const medium = compile(await obfuscate(WORKLOAD, 'medium'));
      expect(low(600)).toBe(plain(600));
      expect(medium(600)).toBe(plain(600));
      const { ratio, plainMs, ratios } = slowdown(plain, low);
      expect(
        ratio,
        `per-round ratios ${ratios.map((r) => r.toFixed(2)).join(' ')}`,
      ).toBeLessThanOrEqual(1.1);
      console.log(
        `[SEC-10] plain ${plainMs.toFixed(1)} ms, low ×${ratio.toFixed(2)}, medium ×${slowdown(plain, medium).ratio.toFixed(2)}`,
      );
    },
  );
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
