import { describe, expect, it, vi } from 'vitest';
import { MobilePlatform, SAVE_KEY_ENTRY } from '../src/platform';
import { fakeDevice } from './fakes';

async function started(platform: 'android' | 'ios' = 'android') {
  const device = fakeDevice(platform);
  const mobile = new MobilePlatform(device.plugins);
  await mobile.init();
  return { device, mobile };
}

async function encrypt(key: CryptoKey, text: string) {
  const iv = new Uint8Array(12);
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
}

async function decrypt(key: CryptoKey, data: ArrayBuffer) {
  const iv = new Uint8Array(12);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data));
}

describe('MobilePlatform save key', () => {
  it('creates a 256-bit key in secure storage once and returns it after a restart', async () => {
    const { device, mobile } = await started();
    const key = await mobile.saveKey();
    expect(await mobile.saveKey()).toBe(key);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    expect(atob(device.secure.get(SAVE_KEY_ENTRY)!)).toHaveLength(32);
    const sealed = await encrypt(key, 'slot 1');

    // Same storage, new process.
    const again = new MobilePlatform(fakeDevice('android', device).plugins);
    expect(await decrypt(await again.saveKey(), sealed)).toBe('slot 1');
    expect(device.calls.filter(([name]) => name === 'secureStorage.set')).toHaveLength(1);
  });

  it('never replaces a key it cannot read', async () => {
    const device = fakeDevice();
    device.secure.set(SAVE_KEY_ENTRY, 'AAAA');
    const mobile = new MobilePlatform(device.plugins);
    await expect(mobile.saveKey()).rejects.toThrow(/3 bytes instead of 32.*Reinstall/);
    device.plugins.secureStorage.get = () => Promise.reject(new Error('Keystore locked'));
    await expect(mobile.saveKey()).rejects.toThrow('Keystore locked');
    expect(device.secure.get(SAVE_KEY_ENTRY)).toBe('AAAA');
  });
});

describe('MobilePlatform native modules', () => {
  it('keeps strings in secure storage, away from the engine keys', async () => {
    const { mobile } = await started();
    expect(await mobile.invoke('secure-storage', 'get', 'token')).toBeNull();
    await mobile.invoke('secure-storage', 'set', 'token', 'abc');
    expect(await mobile.invoke('secure-storage', 'get', 'token')).toBe('abc');
    await mobile.saveKey();
    expect(await mobile.invoke('secure-storage', 'keys')).toEqual(['token']);
    await mobile.invoke('secure-storage', 'remove', 'token');
    await mobile.invoke('secure-storage', 'remove', 'token');
    expect(await mobile.invoke('secure-storage', 'keys')).toEqual([]);
    await expect(mobile.invoke('secure-storage', 'remove', SAVE_KEY_ENTRY)).rejects.toThrow(
      /reserved by the engine/,
    );
    await expect(mobile.invoke('secure-storage', 'set', 'token', 42)).rejects.toThrow(
      /non-empty string/,
    );
  });

  it('maps open / execute / query / close onto Capacitor SQLite', async () => {
    const { device, mobile } = await started('ios');
    await expect(mobile.invoke('sqlite', 'query', 'game', 'SELECT 1')).rejects.toThrow(
      /not open: call open\("game"\)/,
    );
    await expect(mobile.invoke('sqlite', 'open', '../game')).rejects.toThrow(/file name/);
    await mobile.invoke('sqlite', 'open', 'game');
    await mobile.invoke('sqlite', 'open', 'game');
    await mobile.invoke('sqlite', 'open', 'scores.db');
    expect(
      await mobile.invoke('sqlite', 'execute', 'game', 'CREATE TABLE t (a); CREATE TABLE u (b)'),
    ).toEqual({ changes: 0, lastInsertId: 0 });
    expect(
      await mobile.invoke('sqlite', 'execute', 'game', 'INSERT INTO t VALUES (?, ?, ?)', [
        'x',
        true,
        new Uint8Array([1, 2]),
      ]),
    ).toEqual({ changes: 1, lastInsertId: 7 });
    await expect(
      mobile.invoke('sqlite', 'execute', 'game', 'INSERT INTO t VALUES (?)', [{}]),
    ).rejects.toThrow(/booleans, null or Uint8Array/);
    device.rows = [{ ios_columns: ['a', 'b'] }, { a: 'x', b: [1, 2] }];
    expect(await mobile.invoke('sqlite', 'query', 'game', 'SELECT a, b FROM t')).toEqual([
      { a: 'x', b: new Uint8Array([1, 2]) },
    ]);
    await expect(mobile.invoke('sqlite', 'query', 'game', 'SELECT ?', 'x')).rejects.toThrow(
      /must be an array/,
    );
    await mobile.invoke('sqlite', 'close', 'game');
    await mobile.invoke('sqlite', 'close', 'game');
    const sqlite = device.calls.filter(([name]) => name.startsWith('sqlite.'));
    expect(sqlite.map(([name]) => name)).toEqual([
      'sqlite.checkConnectionsConsistency',
      'sqlite.createConnection',
      'sqlite.open',
      'sqlite.createConnection',
      'sqlite.open',
      'sqlite.execute',
      'sqlite.run',
      'sqlite.query',
      'sqlite.close',
      'sqlite.closeConnection',
    ]);
    // iOS binds byte arrays; Android wants Capacitor's Buffer object (checked on the emulator).
    expect(sqlite[6]![1]).toMatchObject({ values: ['x', 1, [1, 2]] });
  });

  it('binds blobs the way Capacitor SQLite expects on Android', async () => {
    const { device, mobile } = await started('android');
    await mobile.invoke('sqlite', 'open', 'game.db');
    await mobile.invoke('sqlite', 'execute', 'game.db', 'INSERT INTO t VALUES (?)', [
      new Uint8Array([7, 0, 255]),
    ]);
    const run = device.calls.find(([name]) => name === 'sqlite.run');
    expect(run![1]).toMatchObject({ values: [{ type: 'Buffer', data: [7, 0, 255] }] });
  });

  it('plays haptics and drives the app', async () => {
    const { device, mobile } = await started();
    await mobile.invoke('haptics', 'impact', 'heavy');
    await mobile.invoke('haptics', 'impact');
    await mobile.invoke('haptics', 'notification', 'error');
    await mobile.invoke('haptics', 'vibrate', 50);
    await mobile.invoke('haptics', 'selection');
    await expect(mobile.invoke('haptics', 'impact', 'huge')).rejects.toThrow(
      /light, medium, heavy/,
    );
    await mobile.invoke('app', 'orientation', 'portrait');
    await mobile.invoke('app', 'orientation', 'any');
    await mobile.invoke('app', 'keepAwake', false);
    await mobile.invoke('app', 'statusBar', true);
    await mobile.invoke('app', 'minimize');
    expect(await mobile.invoke('app', 'info')).toMatchObject({ id: 'com.example.test' });
    expect(device.calls.map(([name, options]) => [name, options])).toEqual([
      ['haptics.impact', { style: 'HEAVY' }],
      ['haptics.impact', { style: 'MEDIUM' }],
      ['haptics.notification', { type: 'ERROR' }],
      ['haptics.vibrate', { duration: 50 }],
      ['haptics.selectionStart', undefined],
      ['haptics.selectionChanged', undefined],
      ['haptics.selectionEnd', undefined],
      ['screenOrientation.lock', { orientation: 'portrait' }],
      ['screenOrientation.unlock', undefined],
      ['keepAwake.allowSleep', undefined],
      ['systemBars.show', undefined],
      ['app.minimizeApp', undefined],
    ]);
  });

  it('routes achievements to the store of the running OS', async () => {
    const { device, mobile } = await started('android');
    expect(await mobile.invoke('playgames', 'signIn')).toMatchObject({ authenticated: true });
    await mobile.invoke('playgames', 'unlock', 'first_win');
    await mobile.invoke('playgames', 'progress', 'collector', 12, 10);
    await mobile.invoke('playgames', 'show');
    await mobile.invoke('playgames', 'submitScore', 'high', 1234.4);
    expect(await mobile.invoke('playgames', 'scores', 'high', 100)).toEqual([
      { rank: 1, name: 'Ada', score: 900 },
    ]);
    await expect(mobile.invoke('gamecenter', 'unlock', 'first_win')).rejects.toThrow(
      /only on iOS; on Android use the "playgames"/,
    );
    await expect(mobile.invoke('playgames', 'progress', 'x', 1, 0)).rejects.toThrow(
      /greater than 0/,
    );
    expect(device.calls.filter(([name]) => name.startsWith('games.'))).toEqual([
      ['games.unlock', { id: 'first_win' }],
      ['games.progress', { id: 'collector', current: 10, total: 10 }],
      ['games.show', undefined],
      ['games.submitScore', { board: 'high', score: 1234 }],
      ['games.scores', { board: 'high', limit: 25 }],
    ]);
    const ios = await started('ios');
    await ios.mobile.invoke('gamecenter', 'unlock', 'first_win');
    await expect(ios.mobile.invoke('playgames', 'show')).rejects.toThrow(/only on Android/);
  });

  it('calls other Capacitor plugins with { args } and returns their value', async () => {
    const { device, mobile } = await started();
    const echo = vi.fn(async (options?: object) => ({ value: options }));
    device.extra.MyNative = { echo };
    expect(await mobile.invoke('MyNative', 'echo', 1, 'two')).toEqual({ args: [1, 'two'] });
    await expect(mobile.invoke('steam', 'unlock')).rejects.toThrow(
      /No native module "steam" on android/,
    );
    await expect(mobile.invoke('haptics', 'explode')).rejects.toThrow(
      /no method "explode".*impact/,
    );
    await expect(mobile.invoke('haptics', 'constructor')).rejects.toThrow(/no method/);
    mobile.register('share', { text: (value) => `shared ${String(value)}` });
    expect(await mobile.invoke('share', 'text', 'hi')).toBe('shared hi');
    expect(() => mobile.register('sqlite', {})).toThrow(/built-in/);
  });
});

describe('MobilePlatform events and system calls', () => {
  it('raises back, pause, resume and deep links from the app plugin', async () => {
    const { device, mobile } = await started();
    const seen: unknown[] = [];
    for (const event of ['back', 'pause', 'resume']) mobile.on(event, () => seen.push(event));
    device.fire('backButton', { canGoBack: false });
    device.fire('pause');
    device.fire('resume');
    expect(seen).toEqual(['back', 'pause', 'resume']);

    // A link that arrives before any listener is kept for the first one.
    device.fire('appUrlOpen', { url: 'mygame://login?code=1' });
    const links: unknown[] = [];
    const off = mobile.on('deeplink', (link) => links.push(link));
    device.fire('appUrlOpen', { url: 'mygame://open' });
    off();
    device.fire('appUrlOpen', { url: 'mygame://late' });
    expect(links).toEqual([{ url: 'mygame://login?code=1' }, { url: 'mygame://open' }]);

    await mobile.dispose();
    device.fire('backButton');
    expect(seen).toHaveLength(3);
  });

  it('reports the launch URL as a deep link', async () => {
    const device = fakeDevice();
    device.plugins.app.getLaunchUrl = async () => ({ url: 'mygame://start' });
    const mobile = new MobilePlatform(device.plugins);
    await mobile.init();
    const links: unknown[] = [];
    mobile.on('deeplink', (link) => links.push(link));
    expect(links).toEqual([{ url: 'mygame://start' }]);
  });

  it('opens web links in the browser and quits on Android only', async () => {
    const android = await started('android');
    await android.mobile.openUrl('https://example.com');
    await expect(android.mobile.openUrl('javascript:alert(1)')).rejects.toThrow(/http\(s\)/);
    android.mobile.quit();
    const ios = await started('ios');
    ios.mobile.quit();
    expect(android.device.calls.map(([name]) => name)).toEqual(['browser.open', 'app.exitApp']);
    expect(ios.device.calls).toEqual([]);
    expect(android.mobile.name).toBe('android');
    expect(ios.mobile.name).toBe('ios');
  });
});
