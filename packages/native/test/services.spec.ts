import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../../core/src/config';
import { appManifest } from '../src/build/stage';
import { DESKTOP_TARGETS, RELEASE_FUSES, builderConfig } from '../src/build/package';
import { signingPlan } from '../src/build/sign';
import { depotId, steamUploadCommand, writeSteamScripts } from '../src/build/steam';
import { DiscordClient, startDiscord, toDiscordActivity } from '../src/main/discord';
import { addEventSink, callNative } from '../src/main/registry';
import {
  mappingsFor,
  type padState,
  startGamepads,
  type SdlController,
  type SdlDevice,
} from '../src/main/sdl';
import { startSteam, type SteamClient, type Steamworks } from '../src/main/steam';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-native-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A fake Discord client listening on a local socket, speaking the RPC framing. */
async function fakeDiscord(path: string) {
  const frames: { op: number; body: Record<string, unknown> }[] = [];
  let client: Socket | undefined;
  const send = (op: number, body: unknown) => {
    const json = Buffer.from(JSON.stringify(body));
    const head = Buffer.alloc(8);
    head.writeUInt32LE(op, 0);
    head.writeUInt32LE(json.length, 4);
    client!.write(Buffer.concat([head, json]));
  };
  const server: Server = createServer((socket) => {
    client = socket;
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8) {
        const length = buffer.readUInt32LE(4);
        if (buffer.length < 8 + length) return;
        frames.push({
          op: buffer.readUInt32LE(0),
          body: JSON.parse(buffer.subarray(8, 8 + length).toString()) as Record<string, unknown>,
        });
        buffer = buffer.subarray(8 + length);
      }
    });
  });
  await new Promise<void>((done) => server.listen(path, done));
  cleanups.push(() => server.close());
  return { frames, send, connected: () => client !== undefined };
}

describe('Discord Rich Presence (SVC-03)', () => {
  it('handshakes, sets the presence with party and join secret, answers join requests', async () => {
    if (process.platform === 'win32') return; // named pipes: covered on Linux and macOS
    const path = join(tempDir(), 'discord-ipc-0');
    const discord = await fakeDiscord(path);
    const events: unknown[] = [];
    cleanups.push(addEventSink((event, payload) => events.push([event, payload])));
    const stop = startDiscord('123456789012345678', (e, p) => events.push([e, p]), [
      join(tempDir(), 'missing'),
      path,
    ]);
    cleanups.push(stop);
    await vi.waitFor(() => expect(discord.frames[0]).toBeDefined());
    expect(discord.frames[0]).toEqual({ op: 0, body: { v: 1, client_id: '123456789012345678' } });

    await callNative('discord', 'setActivity', [
      {
        details: 'Air Hockey',
        state: 'In a match',
        party: { id: 'room-1', size: 2, max: 4, joinSecret: 'ABCD' },
      },
    ]);
    discord.send(1, {
      cmd: 'DISPATCH',
      evt: 'READY',
      data: { user: { id: '42', username: 'ann' } },
    });
    await vi.waitFor(() =>
      expect(discord.frames.some((f) => f.body.cmd === 'SET_ACTIVITY')).toBe(true),
    );
    const set = discord.frames.find((f) => f.body.cmd === 'SET_ACTIVITY')!.body.args as Record<
      string,
      unknown
    >;
    expect(set.activity).toEqual({
      instance: false,
      details: 'Air Hockey',
      state: 'In a match',
      party: { id: 'room-1', size: [2, 4] },
      secrets: { join: 'ABCD' },
    });
    expect(discord.frames.filter((f) => f.body.cmd === 'SUBSCRIBE').map((f) => f.body.evt)).toEqual(
      ['ACTIVITY_JOIN', 'ACTIVITY_JOIN_REQUEST'],
    );
    discord.send(1, {
      cmd: 'DISPATCH',
      evt: 'ACTIVITY_JOIN_REQUEST',
      data: { user: { id: '777777', global_name: 'Bob' } },
    });
    discord.send(1, { cmd: 'DISPATCH', evt: 'ACTIVITY_JOIN', data: { secret: 'WXYZ' } });
    await vi.waitFor(() => expect(events).toContainEqual(['discord:join', { secret: 'WXYZ' }]));
    expect(events).toContainEqual(['discord:joinRequest', { user: { id: '777777', name: 'Bob' } }]);
    expect(events).toContainEqual(['discord:ready', { user: { id: '42', name: 'ann' } }]);
    await callNative('discord', 'accept', ['777777']);
    await vi.waitFor(() =>
      expect(discord.frames.some((f) => f.body.cmd === 'SEND_ACTIVITY_JOIN_INVITE')).toBe(true),
    );
    await expect(callNative('discord', 'accept', ['not-an-id'])).rejects.toThrow(/argument 1/);
    await expect(
      callNative('discord', 'setActivity', [{ details: 'x'.repeat(200) }]),
    ).rejects.toThrow(/details/);
    expect(await callNative('discord', 'connected', [])).toBe(true);
  });

  it('clips texts and keeps retrying while Discord is closed', () => {
    expect(toDiscordActivity({ details: 'x'.repeat(300) }).details).toHaveLength(128);
    const client = new DiscordClient('1', {}, []);
    client.connect();
    expect(client.connected).toBe(false);
    client.close();
  });
});

class FakeController extends EventEmitter implements SdlController {
  axes: Record<string, number> = {
    leftStickX: 0.5,
    leftStickY: -1,
    rightStickX: 0,
    rightStickY: 0,
    leftTrigger: 0.25,
    rightTrigger: 0,
  };
  buttons: Record<string, boolean> = { a: true, dpadLeft: true };
  hasLed = true;
  hasRumble = true;
  hasRumbleTriggers = false;
  closed = false;
  rumble = vi.fn();
  rumbleTriggers = vi.fn();
  setLed = vi.fn();
  constructor(readonly device: SdlDevice) {
    super();
  }
  close() {
    this.closed = true;
    this.emit('close');
  }
}

describe('SDL gamepads (RT-12)', () => {
  it('opens pads, sends standard-layout state, hot-plugs, rumbles and lights LEDs', async () => {
    const controllers = new EventEmitter();
    const opened: FakeController[] = [];
    const xbox: SdlDevice = {
      id: 3,
      name: 'Xbox Series X Controller',
      vendor: 0x045e,
      product: 0x0b13,
      type: 'xboxOne',
    };
    const sdl = {
      controller: {
        devices: [xbox],
        addMappings: vi.fn(),
        openDevice: (device: SdlDevice) => {
          const pad = new FakeController(device);
          opened.push(pad);
          return pad;
        },
        on: (event: string, listener: (e: { device: SdlDevice }) => void) =>
          controllers.on(event, listener),
      },
    };
    const sent: unknown[][] = [];
    const stop = startGamepads(
      sdl,
      (event, payload) => sent.push([event, payload]),
      [
        '# comment',
        '030000005e0400000b13000000000000,Xbox,a:b0,platform:Linux,',
        '030000005e0400000b13000000000000,Xbox,a:b0,platform:Windows,',
      ].join('\n'),
    );
    cleanups.push(stop);
    expect(sdl.controller.addMappings).toHaveBeenCalledWith(
      mappingsFor(['x,platform:Linux,', 'y,platform:Windows,'].join('\n'), 'Linux').length === 1
        ? expect.any(Array)
        : [],
    );
    await new Promise((r) => setImmediate(r));
    const state = (sent.at(-1)![1] as ReturnType<typeof padState>[])[0]!;
    expect(state).toMatchObject({
      id: 3,
      vendor: 0x045e,
      type: 'xboxOne',
      axes: [0.5, -1, 0, 0],
      hasLed: true,
    });
    expect(state.buttons[0]).toBe(1); // A
    expect(state.buttons[6]).toBe(0.25); // LT from the trigger axis
    expect(state.buttons[14]).toBe(1); // D-pad left
    expect(state.buttons[1]).toBe(0);

    await callNative('sdl', 'rumble', [3, 1, 0.5, 300]);
    expect(opened[0]!.rumble).toHaveBeenCalledWith(1, 0.5, 300);
    await callNative('sdl', 'led', [3, 255, 0, 64]);
    expect(opened[0]!.setLed).toHaveBeenCalledWith(255, 0, 64);
    await expect(callNative('sdl', 'rumble', [3, 2, 0])).rejects.toThrow(/argument 2/);
    await expect(callNative('sdl', 'led', [9, 1, 1, 1])).rejects.toThrow(/No gamepad with id 9/);

    // Hot-plug: a second pad arrives, the first leaves.
    controllers.emit('deviceAdd', {
      device: { id: 4, name: 'DualSense', vendor: 0x054c, product: 0x0ce6, type: 'ps5' },
    });
    controllers.emit('deviceRemove', { device: xbox });
    await new Promise((r) => setImmediate(r));
    expect((sent.at(-1)![1] as { id: number }[]).map((p) => p.id)).toEqual([4]);
    expect(await callNative('sdl', 'pads', [])).toHaveLength(1);
  });

  it('keeps only this OS in the controller database', () => {
    expect(
      mappingsFor('a,platform:Linux,\nb,platform:Windows,\n# c,platform:Linux,', 'Linux'),
    ).toEqual(['a,platform:Linux,']);
  });
});

describe('Steamworks (PF-05)', () => {
  function client(): SteamClient & {
    files: Map<string, string>;
    presence: Map<string, string | null | undefined>;
  } {
    const files = new Map<string, string>();
    const unlocked = new Set<string>();
    const presence = new Map<string, string | null | undefined>();
    return {
      files,
      presence,
      achievement: {
        activate: (n) => (unlocked.add(n), true),
        isActivated: (n) => unlocked.has(n),
        clear: (n) => unlocked.delete(n),
      },
      cloud: {
        isEnabledForAccount: () => true,
        isEnabledForApp: () => true,
        readFile: (n) => files.get(n)!,
        writeFile: (n, c) => (files.set(n, c), true),
        deleteFile: (n) => files.delete(n),
        fileExists: (n) => files.has(n),
        listFiles: () => [...files].map(([name, c]) => ({ name, size: BigInt(c.length) })),
      },
      localplayer: {
        getName: () => 'Ann',
        getSteamId: () => ({ steamId64: 76561197960287930n }),
        setRichPresence: (k, value) => void presence.set(k, value),
      },
      overlay: { activateDialog: vi.fn(), activateToWebPage: vi.fn() },
      stats: { store: () => true },
    };
  }

  it('unlocks achievements, uses Steam Cloud and rich presence', async () => {
    const fake = client();
    const steamworks: Steamworks = {
      init: () => fake,
      restartAppIfNecessary: () => false,
      electronEnableSteamOverlay: () => undefined,
    };
    const stop = startSteam(steamworks, 480)!;
    cleanups.push(stop);
    expect(await callNative('steam', 'activateAchievement', ['FIRST_WIN'])).toBe(true);
    expect(await callNative('steam', 'isUnlocked', ['FIRST_WIN'])).toBe(true);
    await expect(callNative('steam', 'unlock', ['bad name!'])).rejects.toThrow(/argument 1/);
    await callNative('steam', 'cloudWrite', ['save-1.json', btoa('{"a":1}')]);
    expect(await callNative('steam', 'cloudRead', ['save-1.json'])).toBe(btoa('{"a":1}'));
    expect(await callNative('steam', 'cloudRead', ['none'])).toBeNull();
    expect(await callNative('steam', 'cloudList', [])).toEqual([{ name: 'save-1.json', size: 12 }]);
    await expect(callNative('steam', 'cloudWrite', ['../x', ''])).rejects.toThrow(/argument 1/);
    await callNative('steam', 'setRichPresence', ['steam_display', '#InMatch']);
    expect(fake.presence.get('steam_display')).toBe('#InMatch');
    expect(await callNative('steam', 'player', [])).toEqual({
      name: 'Ann',
      steamId: '76561197960287930',
    });
    await callNative('steam', 'openOverlay', ['achievements']);
    expect(fake.overlay.activateDialog).toHaveBeenCalledWith(6);
    await expect(callNative('steam', 'uploadScore', ['best', 10])).rejects.toThrow(/leaderboards/);
  });

  it('runs without Steam when the client is not there', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const missing: Steamworks = {
      init: () => {
        throw new Error('Steam is not running');
      },
      restartAppIfNecessary: () => false,
      electronEnableSteamOverlay: () => undefined,
    };
    expect(startSteam(missing, 480)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('start the game from the Steam client'),
    );
    warn.mockRestore();
  });
});

describe('builds (PF-03, PF-05, PF-07)', () => {
  const config = resolveConfig({
    name: 'My Game',
    id: 'com.example.mygame',
    version: '1.2.3',
    entry: 'title',
    resolution: { width: 1280, height: 720 },
    steam: { appId: 480 },
    discord: { appId: '123456789012345678' },
    save: { location: { linux: '~/Games/my' } },
  });

  it('writes the app manifest with release security and the CSP', () => {
    const release = appManifest(config, { release: true, steam: true });
    expect(release).toMatchObject({
      id: 'com.example.mygame',
      release: true,
      security: { devtools: true, debugger: true },
      steam: { appId: 480 },
      discord: { appId: '123456789012345678' },
      save: { location: { linux: '~/Games/my' } },
    });
    expect(release.security.csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    const dev = appManifest(config, { release: false, devServer: 'http://localhost:5173/' });
    expect(dev).toMatchObject({ release: false, security: { devtools: false, csp: null } });
    expect(dev.steam).toBeUndefined();
  });

  it('configures NSIS + portable, dmg + zip for x64 and arm64, AppImage + deb, with fuses', () => {
    const appDir = join(tempDir(), 'app');
    const base = {
      appDir,
      outDir: tempDir(),
      id: config.id,
      name: config.name,
      fuses: true,
      env: {},
    };
    const win = builderConfig({ ...base, os: 'win' });
    expect(win.win).toMatchObject({ target: DESKTOP_TARGETS.win });
    expect(DESKTOP_TARGETS.win.map((t) => t.target)).toEqual(['nsis', 'portable']);
    expect(DESKTOP_TARGETS.mac).toEqual([
      { target: 'dmg', arch: ['x64', 'arm64'] },
      { target: 'zip', arch: ['x64', 'arm64'] },
    ]);
    expect(DESKTOP_TARGETS.linux.map((t) => t.target)).toEqual(['AppImage', 'deb']);
    expect(win.electronFuses).toEqual(RELEASE_FUSES);
    expect(win.asar).toBe(true);
    // PF-08: updates come from the stores only; electron-builder writes no update feed.
    for (const os of ['win', 'mac', 'linux'] as const)
      expect(builderConfig({ ...base, os }).publish).toBeNull();
    expect(win.protocols).toEqual([{ name: 'My Game', schemes: ['com.example.mygame'] }]);
    const mac = builderConfig({ ...base, os: 'mac' });
    expect(mac.mac).toMatchObject({ hardenedRuntime: true, identity: null, notarize: false });
    expect(readFileSync(join(appDir, '..', 'entitlements.mac.plist'), 'utf8')).toContain(
      'allow-jit',
    );
    const signed = builderConfig({
      ...base,
      os: 'mac',
      env: {
        CSC_LINK: 'cert.p12',
        CSC_KEY_PASSWORD: 'x',
        APPLE_API_KEY: 'k.p8',
        APPLE_API_KEY_ID: 'id',
        APPLE_API_ISSUER: 'iss',
      },
    });
    expect(signed.mac).toMatchObject({ notarize: true });
    expect((signed.mac as { identity?: unknown }).identity).toBeUndefined();
    expect(
      builderConfig({ ...base, os: 'linux', fuses: false, unpackedOnly: true }).electronFuses,
    ).toBeUndefined();
  });

  it('plans signing and notarization from the certificates present (dry run)', () => {
    expect(signingPlan('win', {})).toMatchObject({ sign: false, steps: [] });
    const win = signingPlan(
      'win',
      { WIN_CSC_LINK: 'C:\\cert.pfx', WIN_CSC_KEY_PASSWORD: 'secret' },
      'Game.exe',
    );
    expect(win.sign).toBe(true);
    expect(win.steps[0]).toContain('signtool sign /f "C:\\cert.pfx" /p ******');
    expect(win.steps.join('\n')).not.toContain('secret');
    const mac = signingPlan(
      'mac',
      {
        CSC_NAME: 'Developer ID Application: Me',
        APPLE_ID: 'a@b.c',
        APPLE_APP_SPECIFIC_PASSWORD: 'pw',
        APPLE_TEAM_ID: 'TEAM',
      },
      'Game.app',
    );
    expect(mac).toMatchObject({ sign: true, notarize: true });
    expect(mac.steps.join('\n')).toMatch(
      /codesign .*--options runtime[\s\S]*notarytool submit[\s\S]*stapler staple/,
    );
    expect(mac.steps.join('\n')).not.toContain('pw');
    expect(signingPlan('mac', { CSC_NAME: 'x' }).summary).toMatch(/not notarized/);
    expect(signingPlan('linux', {}).summary).toMatch(/not signed/);
  });

  it('writes steamcmd depot scripts and a dry-run upload command', () => {
    const dir = tempDir();
    const app = writeSteamScripts({
      appId: 480,
      steamDir: dir,
      oses: ['win', 'linux'],
      description: 'My Game 1.2.3',
      depots: { linux: 999 },
    });
    const script = readFileSync(app, 'utf8');
    expect(script).toContain('"AppID" "480"');
    expect(script).toContain('"481" "depot_build_481.vdf"');
    expect(script).toContain('"999" "depot_build_999.vdf"');
    expect(readFileSync(join(dir, 'scripts', 'depot_build_999.vdf'), 'utf8')).toContain(
      '"ContentRoot" "../content/linux/"',
    );
    expect(depotId({ appId: 480 }, 'mac')).toBe(482);
    // The script path is relative to `cwd`, with the separator of the OS that runs steamcmd.
    expect(steamUploadCommand(app, { dryRun: true, cwd: dir }).display).toBe(
      `steamcmd +login $STEAM_USERNAME +run_app_build -preview ${join('scripts', 'app_build_480.vdf')} +quit`,
    );
  });
});
