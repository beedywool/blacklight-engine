import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { signCommand } from '../src/commands/desktop';
import { OBFUSCATION_LEVELS, isGameChunk, obfuscate } from '../src/security';
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

  async function measure(source: string): Promise<{ time: number; result: number }> {
    const run = new Function(`${source}; return run;`)() as (steps: number) => number;
    run(200); // warm up the JIT
    const times: number[] = [];
    let result = 0;
    for (let i = 0; i < 9; i++) {
      const start = performance.now();
      result = run(600);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { time: times[4]!, result };
  }

  it(
    'costs at most 10 % at the default level (low), same results',
    { timeout: 120_000 },
    async () => {
      const plain = await measure(WORKLOAD);
      const low = await measure(await obfuscate(WORKLOAD, 'low'));
      expect(low.result).toBe(plain.result);
      // Median of 9 runs each; the comparison is repeated once to absorb a noisy neighbour in CI.
      let ratio = low.time / plain.time;
      if (ratio > 1.1)
        ratio =
          (await measure(await obfuscate(WORKLOAD, 'low'))).time / (await measure(WORKLOAD)).time;
      expect(ratio).toBeLessThanOrEqual(1.1);
      const medium = await measure(await obfuscate(WORKLOAD, 'medium'));
      expect(medium.result).toBe(plain.result);
      console.log(
        `[SEC-10] plain ${plain.time.toFixed(1)} ms, low ×${ratio.toFixed(2)}, medium ×${(medium.time / plain.time).toFixed(2)}`,
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
