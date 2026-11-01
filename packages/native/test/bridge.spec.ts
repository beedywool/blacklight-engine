import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../core/src/modules/schema';
import { defineNative, fn } from '../src/define-native';
import { checkRelativePath, dataFolder, defaultDataDir, expandPath } from '../src/main/files';
import { loadSaveKey } from '../src/main/keystore';
import {
  DeepLinks,
  registerNativeExports,
  startNativeModules,
  startSecureStorage,
} from '../src/main/modules';
import {
  addEventSink,
  callNative,
  method,
  registerNative,
  registeredNatives,
} from '../src/main/registry';
import { classifyKey, debugSwitches } from '../src/main/security';
import { v } from '../src/main/validate';
import { heightForRatio, windowMode, windowSizes } from '../src/main/window';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-native-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('IPC allowlist and argument validation (PF-02)', () => {
  it('reaches only registered methods, with checked arguments', async () => {
    const run = vi.fn((a: number, b: string | undefined) => `${a}${b ?? ''}`);
    cleanups.push(
      registerNative('demo', {
        join: method([v.integer({ min: 0, max: 10 }), v.optional(v.string({ max: 3 }))], run),
        point: method([v.object({ x: v.number(), y: v.number() })], (p) => p.x + p.y),
        bytes: method([v.bytes({ max: 4 })], (b) => b.length),
        pick: method([v.literal('a', 'b')], (x) => x),
        list: method([v.array(v.boolean(), { max: 2 })], (l) => l.length),
      }),
    );
    expect(await callNative('demo', 'join', [3, 'abc'])).toBe('3abc');
    expect(await callNative('demo', 'join', [3])).toBe('3');
    await expect(callNative('demo', 'join', [11])).rejects.toThrow(
      /argument 1 must be an integer from 0 to 10/,
    );
    await expect(callNative('demo', 'join', [1, 'abcd'])).rejects.toThrow(/argument 2/);
    await expect(callNative('demo', 'join', [1, 'a', 'extra'])).rejects.toThrow(
      /at most 2 arguments/,
    );
    await expect(callNative('demo', 'point', [{ x: 1, y: 2, z: 3 }])).rejects.toThrow(
      /\.z must be absent/,
    );
    await expect(callNative('demo', 'point', [{ x: 1 }])).rejects.toThrow(
      /\.y must be a finite number/,
    );
    expect(await callNative('demo', 'point', [{ x: 1, y: 2 }])).toBe(3);
    await expect(callNative('demo', 'bytes', [new Uint8Array(5)])).rejects.toThrow(
      /at most 4 bytes/,
    );
    await expect(callNative('demo', 'pick', ['c'])).rejects.toThrow(/one of "a", "b"/);
    await expect(callNative('demo', 'list', [[true, false, true]])).rejects.toThrow(/at most 2/);
    await expect(callNative('demo', 'constructor', [])).rejects.toThrow(/not a native method/);
    await expect(callNative('demo', '__proto__', [])).rejects.toThrow(/not a native method/);
    await expect(callNative('nope', 'x', [])).rejects.toThrow(/No native module "nope"/);
    await expect(callNative('demo', 'join', 'not-an-array')).rejects.toThrow(/Malformed/);
    expect(run).toHaveBeenCalledTimes(2);
    expect(() => registerNative('demo', {})).toThrow(/already registered/);
    expect(() => registerNative('Bad Name', {})).toThrow(/Invalid native module name/);
    expect(() =>
      registerNative('raw', { f: { run: () => 1 } as unknown as ReturnType<typeof method> }),
    ).toThrow(/method\(\[validators\], handler\)/);
    expect(registeredNatives().demo).toContain('point');
    expect(() => v.json({ maxBytes: 4 }).parse({ a: 1 }, 'x')).toThrow(/at most 4 bytes/);
  });

  it('forwards events to every window', () => {
    const seen: unknown[] = [];
    const off = addEventSink((event, payload) => seen.push([event, payload]));
    off();
    expect(seen).toEqual([]);
  });
});

describe('defineNative modules in the main process (MOD-03)', () => {
  it('registers exported modules, sets them up, validates through call() and disposes', async () => {
    const log: string[] = [];
    const notes = defineNative({
      name: 'notes-test',
      functions: {
        upper: fn(
          [t.string({ max: 5 })],
          (context, text) => `${context.gameId}:${text.toUpperCase()}`,
        ),
      },
      setup: () => void log.push('setup'),
      dispose: () => void log.push('dispose'),
    });
    const modules = registerNativeExports('notes.cjs', { notes, other: 1 }, {});
    expect(modules).toEqual([notes]);
    const dispose = await startNativeModules(modules, {
      gameId: 'com.test',
      dataDir: '/tmp',
      dev: false,
    });
    expect(await callNative('notes-test', 'upper', ['hi'])).toBe('com.test:HI');
    await expect(callNative('notes-test', 'upper', [42])).rejects.toThrow(/refused its arguments/);
    await expect(callNative('notes-test', 'run', [])).rejects.toThrow(/not a native method/);
    await dispose();
    expect(log).toEqual(['setup', 'dispose']);
    await expect(callNative('notes-test', 'upper', ['hi'])).rejects.toThrow(/No native module/);
    expect(() => registerNativeExports('empty.cjs', {}, {})).toThrow(/exports no native module/);
    const api = vi.fn();
    expect(registerNativeExports('fn.cjs', api, { registerNative })).toEqual([]);
    expect(api).toHaveBeenCalledWith({ registerNative });
  });

  it('keeps deep links until the game listens, then emits them', async () => {
    const seen: unknown[] = [];
    cleanups.push(addEventSink((event, payload) => seen.push([event, payload])));
    const links = new DeepLinks('com.test.game');
    cleanups.push(() => undefined);
    links.fromArgv(['/usr/bin/game', '--flag', 'com.test.game:/oauth/callback?code=1']);
    expect(seen).toEqual([]);
    expect(await callNative('deeplinks', 'take', [])).toEqual([
      'com.test.game:/oauth/callback?code=1',
    ]);
    links.receive('com.test.game:/join/abc');
    expect(seen).toEqual([['deeplink', { url: 'com.test.game:/join/abc' }]]);
  });

  it('stores secure-storage values encrypted by the OS keystore', async () => {
    const dir = tempDir();
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (text: string) => Buffer.from(text, 'utf8').reverse(),
      decryptString: (data: Buffer) => Buffer.from(data).reverse().toString('utf8'),
    };
    const file = join(dir, 'secure.bin');
    const off = startSecureStorage(file, storage);
    await callNative('secure-storage', 'set', ['token', 'secret-value']);
    expect(await callNative('secure-storage', 'get', ['token'])).toBe('secret-value');
    expect(readFileSync(file).toString('utf8')).not.toContain('secret-value');
    await callNative('secure-storage', 'remove', ['token']);
    expect(await callNative('secure-storage', 'get', ['token'])).toBeNull();
    off();
  });
});

describe('data folder (SV-02, SV-04)', () => {
  it('uses the OS standard folder or the configured one', () => {
    const env = {
      APPDATA: 'C:\\Users\\a\\AppData\\Roaming',
      XDG_DATA_HOME: '/xdg',
      GAMES: '/games',
    };
    // Each platform's own path rules, whatever OS runs the test.
    expect(defaultDataDir('com.x.y', undefined, 'win32', env, 'C:\\Users\\a')).toBe(
      'C:\\Users\\a\\AppData\\Roaming\\com.x.y',
    );
    expect(defaultDataDir('com.x.y', undefined, 'win32', {}, 'C:\\Users\\a')).toBe(
      'C:\\Users\\a\\AppData\\Roaming\\com.x.y',
    );
    expect(defaultDataDir('com.x.y', undefined, 'darwin', env, '/Users/a')).toBe(
      '/Users/a/Library/Application Support/com.x.y',
    );
    expect(defaultDataDir('com.x.y', undefined, 'linux', env, '/home/a')).toBe('/xdg/com.x.y');
    expect(defaultDataDir('com.x.y', undefined, 'linux', {}, '/home/a')).toBe(
      '/home/a/.local/share/com.x.y',
    );
    expect(
      defaultDataDir('com.x.y', { windows: '%GAMES%\\mine' }, 'win32', { GAMES: 'D:\\games' }),
    ).toBe('D:\\games\\mine');
    expect(defaultDataDir('com.x.y', { linux: '$GAMES/mine' }, 'linux', env, '/home/a')).toBe(
      '/games/mine',
    );
    expect(defaultDataDir('com.x.y', '~/Saves', 'linux', env, '/home/a')).toBe('/home/a/Saves');
    expect(expandPath('%GAMES%/x', env)).toBe('/games/x');
  });

  it('refuses paths that leave the folder and writes atomically', async () => {
    for (const bad of ['../x', 'a/../../b', '/etc/passwd', 'C:\\x', 'a//b', '', 'a/.', 'con.']) {
      expect(() => checkRelativePath(bad), bad).toThrow(/Invalid file path/);
    }
    const dir = tempDir();
    const files = dataFolder(dir);
    await files.write('saves/1.sav', new Uint8Array([1, 2]));
    await files.write('saves/1.sav', new Uint8Array([3]));
    expect(await files.read('saves/1.sav')).toEqual(new Uint8Array([3]));
    expect(readdirSync(join(dir, 'saves'))).toEqual(['1.sav']); // no temporary file left
    expect(await files.read('saves/none')).toBeUndefined();
    await files.write('other.txt', new Uint8Array([1]));
    expect(await files.list('saves/')).toEqual(['saves/1.sav']);
    expect(await files.list()).toEqual(['other.txt', 'saves/1.sav']);
    await files.remove('saves/1.sav');
    expect(await files.list('saves/')).toEqual([]);
    await expect(files.read('../escape')).rejects.toThrow(/Invalid file path/);
  });
});

describe('save key (SV-03)', () => {
  it('creates a random key once, encrypted by the OS keystore', async () => {
    const file = join(tempDir(), 'save.key');
    const storage = {
      isEncryptionAvailable: () => true,
      encryptString: (text: string) => Buffer.from(`enc:${text}`),
      decryptString: (data: Buffer) => data.toString().slice(4),
    };
    const key = await loadSaveKey(file, storage);
    expect(key.length).toBe(32);
    expect(readFileSync(file)[0]).toBe(1);
    expect(await loadSaveKey(file, storage)).toEqual(key);
    const warn = vi.fn();
    const plainFile = join(tempDir(), 'save.key');
    const plain = await loadSaveKey(
      plainFile,
      { ...storage, isEncryptionAvailable: () => false },
      warn,
    );
    expect(warn).toHaveBeenCalled();
    expect(await loadSaveKey(plainFile, storage)).toEqual(plain);
  });
});

describe('window and shortcuts (PF-02, SEC-01)', () => {
  it('sizes the window to the design ratio and restores it after a resize', () => {
    const { size, minSize } = windowSizes(
      { width: 1920, height: 1080 },
      { width: 1920, height: 1040 },
    );
    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
    expect(size.height).toBeLessThanOrEqual(1040 * 0.8 + 1);
    expect(minSize).toEqual({ width: 960, height: 540 });
    expect(heightForRatio({ width: 1000, height: 1000 }, 16 / 9)).toBe(563);
    expect(heightForRatio({ width: 1600, height: 900 }, 16 / 9)).toBeUndefined();
  });

  it('keeps a windowed start fullscreenable (macOS disables it on an explicit fullscreen: false)', () => {
    expect(windowMode()).toEqual({ fullscreen: false, fullscreenable: true, resizable: true });
    expect(windowMode({ fullscreen: true, resizable: false })).toEqual({
      fullscreen: true,
      fullscreenable: true,
      resizable: false,
    });
    expect(windowMode({ fullscreen: true }, false).fullscreen).toBe(false);
    expect(windowMode({ resizable: false }, false).fullscreenable).toBe(true);
  });

  it('recognizes devtools, reload and fullscreen keys, and debugging switches', () => {
    const key = (
      code: string,
      mods: Partial<Record<'control' | 'meta' | 'shift' | 'alt', boolean>> = {},
      k = '',
    ) =>
      classifyKey({
        type: 'keyDown',
        key: k,
        code,
        control: false,
        meta: false,
        shift: false,
        alt: false,
        ...mods,
      });
    expect(key('F12')).toBe('devtools');
    expect(key('KeyI', { control: true, shift: true })).toBe('devtools');
    expect(key('KeyI', { meta: true, alt: true })).toBe('devtools');
    expect(key('', { control: true, shift: true }, 'i')).toBe('devtools'); // synthesized, no code
    expect(key('KeyR', { control: true })).toBe('reload');
    expect(key('F11')).toBe('fullscreen');
    expect(key('Enter', { alt: true })).toBe('fullscreen');
    expect(key('KeyI')).toBeUndefined();
    expect(
      debugSwitches([
        'game',
        '--inspect=9229',
        '--remote-debugging-port=1',
        '--js-flags=--x',
        '--foo',
      ]),
    ).toEqual(['inspect', 'remote-debugging-port', 'js-flags']);
    expect(debugSwitches(['game', 'com.x:/oauth'])).toEqual([]);
  });
});
