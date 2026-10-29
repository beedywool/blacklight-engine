import { describe, expect, it, vi } from 'vitest';
import { ConfigError, resolveConfig } from '../src/config';
import { EventBus } from '../src/events';
import {
  SecurityRuntime,
  contentSecurityPolicy,
  protect,
  resolveSecurity,
  type TamperEvent,
} from '../src/security/index';

type Poke = { poke(value: unknown): void; pokeMasked(): void };

const base = {
  name: 'Game',
  id: 'com.test.game',
  version: '1.0.0',
  entry: 'title',
  resolution: { width: 640, height: 360 },
};

describe('security settings', () => {
  it('turns every measure on in release builds and off in dev', () => {
    const release = resolveSecurity(undefined, true);
    expect(release).toEqual({
      devtools: true,
      fuses: true,
      obfuscate: 'low',
      bytecode: true,
      protect: [],
      debugger: true,
      webview: true,
      csp: {},
      onTamper: 'restore',
    });
    const dev = resolveSecurity({ protect: ['Player.hp'], obfuscate: 'high' }, false);
    expect(Object.values(dev).filter((v) => v === true)).toEqual([]);
    expect(dev.protect).toEqual([]);
    expect(dev.obfuscate).toBe(false);
    expect(resolveSecurity(false, true).devtools).toBe(false);
    const custom = resolveSecurity({ fuses: false, obfuscate: 'medium', csp: false }, true);
    expect(custom).toMatchObject({ fuses: false, obfuscate: 'medium', csp: false, devtools: true });
  });

  it('validates the security, save and desktop sections with readable errors', () => {
    try {
      resolveConfig({
        ...base,
        save: { slots: 0, migrations: { 3: 'nope' }, location: { amiga: '/x' } },
        security: {
          obfuscate: 'max',
          protect: ['hp'],
          csp: { connect: ["'unsafe-eval'"] },
          nope: 1,
        },
        window: { fullscreen: 'yes', minSize: { width: 0, height: 1 } },
        steam: { appId: 'abc' },
        discord: { appId: 12 },
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const issues = (error as ConfigError).issues.join('\n');
      for (const fragment of [
        'save.slots',
        'save.migrations[3]',
        'save.location.amiga',
        'security.obfuscate',
        '"hp"',
        'security.csp.connect',
        'security.nope',
        'window.fullscreen',
        'window.minSize',
        'steam.appId',
        'discord.appId',
      ]) {
        expect(issues).toContain(fragment);
      }
    }
    const ok = resolveConfig({
      ...base,
      save: { slots: 3, version: 2, migrations: { 2: (d: Record<string, unknown>) => d } },
      security: {
        protect: ['Player.hp', 'save.gold'],
        csp: { connect: ['https://api.example.com'] },
      },
      window: { fullscreen: true },
      steam: { appId: 480 },
      discord: { appId: '123456789012345678' },
    });
    expect(ok.steam).toEqual({ appId: 480 });
  });

  it('builds a CSP without eval or inline scripts (SEC-08)', () => {
    const csp = contentSecurityPolicy({ connect: ['wss://relay.example.com'] });
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(eval|inline)'/);
    expect(csp).toContain("object-src 'none'");
    // 3D decoders (Draco, KTX2) and Pixi's image loading run WebAssembly in blob: workers.
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain('connect-src');
    expect(csp).toContain('wss://relay.example.com');
  });
});

describe('protected values (SEC-05)', () => {
  it('keeps working through the setter and detects memory edits of either copy', () => {
    const player = { hp: 100, name: 'Ann' };
    const reports: { expected: unknown; found: unknown }[] = [];
    const hp = protect(player, 'hp', (info) => {
      reports.push({ expected: info.expected, found: info.found });
      info.restore();
    }) as ReturnType<typeof protect> & Poke;
    player.hp -= 30;
    expect(player.hp).toBe(70);
    expect(hp.verify()).toBe(true);
    expect(JSON.stringify(player)).toBe('{"hp":70,"name":"Ann"}');

    hp.poke(9999); // a memory editor changes the visible value
    expect(player.hp).toBe(70); // read verifies, reports and restores
    expect(reports).toEqual([{ expected: 70, found: 9999 }]);

    hp.pokeMasked(); // a memory editor found the masked copy
    expect(hp.verify()).toBe(false);
    expect(player.hp).toBe(70);
    expect(hp.verify()).toBe(true);

    const label = protect(player, 'name', (info) => info.restore()) as ReturnType<typeof protect> &
      Poke;
    label.poke('Hacker');
    expect(player.name).toBe('Ann');
  });
});

function runtime(protectPaths: string[], options = {}) {
  const events = new EventBus<{ step: void; tamper: TamperEvent }>();
  const hero = { hp: 10 };
  const scene = {
    name: 'level',
    score: 0,
    findAll: (name: string) => (name === 'Player' ? [hero] : []),
  };
  const host = {
    events,
    scene,
    save: { data: { gold: 50 } as Record<string, unknown> },
    platform: { quit: vi.fn() },
  };
  const security = new SecurityRuntime(
    host,
    { ...resolveSecurity({ protect: protectPaths }, true), debugger: false, devtools: false },
    options,
  );
  return { security, events, hero, scene, host };
}

describe('tamper reaction (SEC-09)', () => {
  it('restores and logs without a handler; a handler replaces the default', () => {
    const { security, events, hero, host, scene } = runtime([
      'Player.hp',
      'save.gold',
      'level.score',
    ]);
    security.start();
    events.emit('step');
    expect(Object.getOwnPropertyDescriptor(hero, 'hp')?.get).toBeTypeOf('function');
    expect(Object.getOwnPropertyDescriptor(host.save.data, 'gold')?.get).toBeTypeOf('function');
    expect(Object.getOwnPropertyDescriptor(scene, 'score')?.get).toBeTypeOf('function');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Reach the wrapped handle the way a memory editor would reach memory: through internals.
    const protectedHp = (security as unknown as { active: (ReturnType<typeof protect> & Poke)[] })
      .active[0];
    protectedHp!.poke(500);
    for (let i = 0; i < 15; i++) events.emit('step'); // periodic verification
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Player.hp'));
    expect(hero.hp).toBe(10);

    const seen: TamperEvent[] = [];
    events.on('tamper', (event) => seen.push(event));
    protectedHp!.poke(600);
    expect(hero.hp).toBe(600); // the handler did not restore
    expect(seen[0]).toMatchObject({ kind: 'value', path: 'Player.hp', expected: 10, found: 600 });
    seen[0]!.restore();
    expect(hero.hp).toBe(10);
    warn.mockRestore();
    security.stop();
  });

  it('quits with onTamper: "quit"', () => {
    const { host } = runtime([]);
    const quitting = new SecurityRuntime(
      { ...host, events: new EventBus<{ step: void; tamper: TamperEvent }>() },
      { ...resolveSecurity({ onTamper: 'quit' }, true), debugger: false, devtools: false },
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    quitting.tamper({ kind: 'devtools', restore: () => undefined });
    expect(host.platform.quit).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('debugger detection (SEC-06) and devtools shortcuts (SEC-01)', () => {
  it('reports a pause around the debugger statement', async () => {
    vi.useFakeTimers();
    let clock = 0;
    let attached = false;
    const events = new EventBus<{ step: void; tamper: TamperEvent }>();
    const security = new SecurityRuntime(
      { events, platform: { quit: () => undefined } },
      { ...resolveSecurity(undefined, true), devtools: false },
      { now: () => clock, probe: () => void (clock += attached ? 500 : 1), interval: 100 },
    );
    const seen: string[] = [];
    events.on('tamper', (e) => seen.push(e.kind));
    security.start();
    vi.advanceTimersByTime(300);
    expect(seen).toEqual([]);
    attached = true;
    vi.advanceTimersByTime(300);
    expect(seen).toEqual(['debugger']); // once per attach, not every probe
    security.stop();
    vi.useRealTimers();
  });

  it('blocks F12, Ctrl+Shift+I and the context menu', () => {
    const target = new EventTarget();
    const events = new EventBus<{ step: void; tamper: TamperEvent }>();
    const security = new SecurityRuntime(
      { events, platform: { quit: () => undefined } },
      { ...resolveSecurity(undefined, true), debugger: false },
      { target },
    );
    security.start();
    const key = (code: string, mods: Partial<KeyboardEvent> = {}) => {
      const event = Object.assign(new Event('keydown', { cancelable: true }), {
        code,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        ...mods,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(key('F12')).toBe(true);
    expect(key('KeyI', { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(key('KeyI', { metaKey: true, altKey: true })).toBe(true);
    expect(key('KeyI')).toBe(false);
    const menu = new Event('contextmenu', { cancelable: true });
    target.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    security.stop();
    expect(key('F12')).toBe(false);
  });
});
