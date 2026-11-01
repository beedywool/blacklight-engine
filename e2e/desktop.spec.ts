// Phase 3c gate: the desktop app (Electron) on this OS. The fixture is built for the host OS as a
// packaged, unpacked app (`--dir`): fuses, bytecode main process, release security. Playwright
// drives the staged app with the development Electron binary (a fused binary refuses the
// debugging port Playwright needs); the packaged binary is checked by spawning it.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { NativeBridge } from '@blacklight/native';
import type * as NativeBuild from '@blacklight/native/build';
import { run } from './server';

const root = resolve(import.meta.dirname, '..');
const fixture = join(root, 'e2e/fixtures/desktop');
const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const out = join(fixture, 'release', os);
const appDir = join(out, 'app');
const electronBinary = createRequire(join(root, 'packages/native/package.json'))(
  'electron',
) as string;
const GAME_ID = 'dev.blacklight.fixture.desktop';
// Never wait on the OS keystore: a prompt would hang the test and CI has nobody to answer it.
// Linux: the desktop's keyring (CI has none); macOS: the login Keychain, which a headless runner
// leaves the save key's first read waiting on (the real Keychain is in MANUAL_TESTS.md).
const KEYRING =
  os === 'linux' ? ['--password-store=basic'] : os === 'mac' ? ['--use-mock-keychain'] : [];

/** Environment that puts the OS data folder (SV-02) in a temporary folder. */
function sandbox(): {
  dir: string;
  env: Record<string, string>;
  dataDir: string;
  dispose(): void;
} {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-desktop-'));
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  let dataDir: string;
  if (os === 'linux') {
    env.XDG_DATA_HOME = join(dir, 'data');
    env.XDG_CONFIG_HOME = join(dir, 'config');
    dataDir = join(dir, 'data', GAME_ID);
  } else if (os === 'win') {
    env.APPDATA = join(dir, 'data');
    dataDir = join(dir, 'data', GAME_ID);
  } else {
    env.HOME = dir;
    dataDir = join(dir, 'Library', 'Application Support', GAME_ID);
  }
  return {
    dir,
    env,
    dataDir,
    dispose: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }),
  };
}

async function launch(
  app: string,
  env: Record<string, string>,
): Promise<{ electron: ElectronApplication; page: Page }> {
  const electron = await _electron.launch({
    executablePath: electronBinary,
    args: [app, ...KEYRING],
    env,
  });
  const page = await electron.firstWindow();
  await expect(page.locator('#game')).toHaveAttribute('data-ready', '1', { timeout: 30_000 });
  return { electron, page };
}

/**
 * Presses keys through Electron's input pipeline (`sendInputEvent`), which, unlike page-level
 * automation, goes through `before-input-event` like a real keyboard.
 */
async function press(electron: ElectronApplication, keys: string): Promise<void> {
  const parts = keys.split('+');
  const key = parts.pop()!;
  const modifiers = parts.map(
    (m) => ({ Control: 'control', Shift: 'shift', Alt: 'alt', Meta: 'meta' })[m]!,
  );
  await electron.evaluate(
    ({ BrowserWindow }, { key, modifiers }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: modifiers as never });
      contents.sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: modifiers as never });
    },
    { key, modifiers },
  );
}

const status = (page: Page, key: string) =>
  page.locator('#game').evaluate((el, k) => (el as HTMLElement).dataset[k], key);

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  test.setTimeout(600_000);
  run(
    'pnpm',
    [
      'exec',
      'blacklight',
      'build',
      '--target',
      os,
      '--dir',
      ...(os === 'mac' ? ['--arch', process.arch] : []),
    ],
    fixture,
  );
});

test('PF-02: app:// protocol, sandboxed window, minimal validated bridge', async () => {
  const box = sandbox();
  const { electron, page } = await launch(appDir, box.env);
  expect(page.url()).toBe('app://game/index.html');
  // MOD-03: the fixture's `echo` module answered from its native part in the main process.
  expect(await status(page, 'echo')).toBe(`HI!:${GAME_ID}`);
  expect(await status(page, 'platform')).toBe('desktop');
  const prefs = await electron.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0]!.webContents.getLastWebPreferences()!;
    return {
      contextIsolation: p.contextIsolation,
      sandbox: p.sandbox,
      nodeIntegration: p.nodeIntegration,
    };
  });
  expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false });
  const page_ = await page.evaluate(async () => {
    const bridge = window.blacklightNative!;
    const fail = (p: Promise<unknown>) =>
      p.then(
        () => 'resolved',
        (e: Error) => e.message,
      );
    return {
      keys: Object.keys(bridge).sort(),
      node: [
        typeof (globalThis as { require?: unknown }).require,
        typeof (globalThis as { process?: unknown }).process,
      ],
      escape: await fail(bridge.invoke('files', 'read', ['../../../etc/passwd'])),
      unknownModule: await fail(bridge.invoke('fs', 'readFile', ['/etc/passwd'])),
      badUrl: await fail(bridge.invoke('shell', 'openUrl', ['file:///etc/passwd'])),
      badType: await fail(bridge.invoke('window', 'setFullscreen', ['yes'])),
      extraArgs: await fail(bridge.invoke('keystore', 'saveKey', [1])),
      nativeArgs: await fail(bridge.invoke('echo', 'shout', [42])),
      secret: await bridge
        .invoke('secure-storage', 'set', ['token', 'abc'])
        .then(() => bridge.invoke('secure-storage', 'get', ['token'])),
      csp: await fetch('index.html').then((r) => r.headers.get('content-security-policy')),
      relay: [
        await bridge.invoke('relay', 'start', [{ port: 5337 }]),
        await bridge.invoke('relay', 'status', []),
        await bridge.invoke('relay', 'stop', []).then(() => bridge.invoke('relay', 'status', [])),
        await fail(bridge.invoke('relay', 'start', [{ port: 80 }])),
      ],
      evalBlocked: (() => {
        try {
          return String(eval('1 + 1'));
        } catch (e) {
          return (e as Error).name;
        }
      })(),
    };
  });
  expect(page_.keys).toEqual(['info', 'invoke', 'subscribe']);
  expect(page_.node).toEqual(['undefined', 'undefined']);
  expect(page_.escape).toMatch(/Invalid file path/);
  expect(page_.unknownModule).toMatch(/No native module "fs"/);
  expect(page_.badUrl).toMatch(/openUrl argument 1 must be/);
  expect(page_.badType).toMatch(/must be a boolean/);
  expect(page_.extraArgs).toMatch(/at most 0 arguments/);
  expect(page_.nativeArgs).toMatch(/"echo.shout" refused its arguments/);
  expect(page_.secret).toBe('abc');
  // NET-01 LAN hosting from the desktop app.
  expect(page_.relay[0]).toMatchObject({ port: 5337 });
  expect(page_.relay[1]).toMatchObject({ running: true, port: 5337, rooms: 0 });
  expect(page_.relay[2]).toMatchObject({ running: false });
  expect(page_.relay[3]).toMatch(/from 1024 to 65535/);
  expect(page_.csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(page_.csp).toContain("worker-src 'self' blob:");
  expect(page_.evalBlocked).toBe('EvalError'); // SEC-08: CSP header, no eval
  await electron.close();
  box.dispose();
});

test('SV-01–SV-04: encrypted saves in the OS folder; a modified save is rejected, the backup offered', async () => {
  const box = sandbox();
  let { electron, page } = await launch(appDir, box.env);
  expect(await status(page, 'location')).toBe(box.dataDir);
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toHaveAttribute('data-saved', '10');
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).toHaveAttribute('data-saved', '20');
  await electron.close();

  const file = join(box.dataDir, 'saves', '1.sav');
  const saved = readFileSync(file);
  expect(saved.subarray(0, 4).toString()).toBe('BLSV');
  expect(saved.toString('latin1')).not.toContain('gold');
  expect(existsSync(join(box.dataDir, 'saves', '1.bak'))).toBe(true);
  expect(readdirSync(join(box.dataDir, 'saves')).some((f) => f.endsWith('.tmp'))).toBe(false);

  ({ electron, page } = await launch(appDir, box.env));
  expect(await status(page, 'save')).toBe('loaded');
  expect(await status(page, 'gold')).toBe('20');
  await electron.close();

  // A save editor changes one byte.
  saved[saved.length - 40] = saved[saved.length - 40]! ^ 0x01;
  writeFileSync(file, saved);
  ({ electron, page } = await launch(appDir, box.env));
  expect(await status(page, 'save')).toBe('tampered+backup');
  expect(await status(page, 'backup')).toBe('true');
  expect(await status(page, 'gold')).toBe('10');
  await electron.close();
  box.dispose();
});

test('SEC-01: developer tools shortcuts are ignored in release, work in dev', async () => {
  const box = sandbox();
  const opened = (electron: ElectronApplication) =>
    electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.isDevToolsOpened(),
    );
  const release = await launch(appDir, box.env);
  const page = release.page;
  let electron = release.electron;
  for (const keys of ['F12', 'Control+Shift+I', 'Control+Shift+J', 'Meta+Alt+I']) {
    await page.keyboard.press(keys);
    await press(electron, keys);
  }
  await page.waitForTimeout(500);
  expect(await opened(electron)).toBe(false);
  await electron.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.openDevTools(),
  );
  await page.waitForTimeout(500);
  expect(await opened(electron)).toBe(false);
  const menu = await page.evaluate(() => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.querySelector('canvas')!.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(menu).toBe(true);
  await electron.close();

  // Positive control: the same app with a dev manifest opens them with F12.
  const devApp = join(fixture, 'release', `${os}-dev-app`);
  rmSync(devApp, { recursive: true, force: true });
  cpSync(appDir, devApp, { recursive: true, dereference: true });
  const manifest = JSON.parse(readFileSync(join(devApp, 'blacklight.json'), 'utf8'));
  manifest.release = false;
  manifest.security = { devtools: false, debugger: false, csp: null };
  writeFileSync(join(devApp, 'blacklight.json'), JSON.stringify(manifest));
  ({ electron } = await launch(devApp, box.env));
  await press(electron, 'F12');
  await expect.poll(() => opened(electron)).toBe(true);
  await electron.close();
  rmSync(devApp, { recursive: true, force: true });
  box.dispose();
});

test('PF-02: the window keeps the aspect ratio, goes fullscreen and quits', async () => {
  const box = sandbox();
  const { electron, page } = await launch(appDir, box.env);
  // What the window looked like, for a failure message: on the macOS runner a window that never
  // went fullscreen, and its retry that never got its ratio back, left nothing else to read.
  const state = () =>
    electron.evaluate(({ app, BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0]!;
      return JSON.stringify({
        userData: app.getPath('userData'),
        content: win.getContentSize(),
        visible: win.isVisible(),
        focused: win.isFocused(),
        fullscreen: win.isFullScreen(),
        fullscreenable: win.isFullScreenable(),
        workArea: screen.getPrimaryDisplay().workAreaSize,
      });
    });
  /** Polls `check` for 15 s (window managers and macOS's fullscreen animation take their time). */
  const until = async (what: string, check: () => Promise<boolean>) => {
    try {
      await expect.poll(check, { timeout: 15_000 }).toBe(true);
    } catch (error) {
      throw new Error(`${what} did not happen: ${await state()}`, { cause: error });
    }
  };
  try {
    await electron.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.setContentSize(1000, 1000),
    );
    await until('16:9 after a resize to 1000×1000', async () => {
      const [w, h] = await electron.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.getContentSize(),
      );
      return Math.abs(w! / h! - 16 / 9) < 0.02;
    });
    await page.evaluate(() => window.blacklightNative!.invoke('window', 'setFullscreen', [true]));
    await until('fullscreen', () =>
      page.evaluate(() => window.blacklightNative!.invoke('window', 'isFullscreen', [])),
    );
    await page.evaluate(() => window.blacklightNative!.invoke('window', 'setFullscreen', [false]));
    const closed = electron.waitForEvent('close');
    // The fixture calls game.platform.quit() on Escape; the app may close before the key goes up.
    await page.keyboard.down('Escape');
    await closed;
  } finally {
    // The app saves the fullscreen choice in Electron's userData, which on macOS may not follow
    // the sandbox's HOME: the macOS runner's retry opened fullscreen right away after a failed
    // attempt. The failure message shows where userData was.
    const settings = await electron
      .evaluate(({ app }) => app.getPath('userData'))
      .then((dir) => join(dir, 'window.json'))
      .catch(() => undefined);
    // A failed attempt must not leave a fullscreen window over the retry's.
    await electron.close().catch(() => undefined);
    if (settings) rmSync(settings, { force: true });
    box.dispose();
  }
});

test('RT-12: SDL pads reach the input system over the bridge, same API', async () => {
  const box = sandbox();
  const { electron, page } = await launch(appDir, box.env);
  // The SDL module is registered: the page reads pads from SDL, not the Gamepad API.
  expect(await page.evaluate(() => window.blacklightNative!.invoke('sdl', 'pads', []))).toEqual([]);
  // Simulate what the main process sends when SDL reports a pad (hot-plug + button A held).
  const pad = {
    id: 7,
    name: 'Xbox Series X Controller',
    vendor: 0x045e,
    product: 0x0b13,
    type: 'xboxOne',
    buttons: [1, ...Array(16).fill(0)],
    axes: [0, 0, 0, 0],
    hasRumble: true,
    hasRumbleTriggers: true,
    hasLed: false,
    hasGyro: false,
  };
  await electron.evaluate(({ BrowserWindow }, state) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send('blacklight:event', 'sdl:pads', [state]);
  }, pad);
  await expect(page.locator('#game')).toHaveAttribute('data-pads', 'Xbox Series X Controller:1');
  await electron.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send('blacklight:event', 'sdl:pads', []);
  });
  await expect(page.locator('#game')).toHaveAttribute('data-pads', '');
  await electron.close();
  box.dispose();
});

/** Path of the packaged executable electron-builder wrote. */
function packagedExecutable(): string {
  const name = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
    name: string;
    productName: string;
  };
  if (os === 'linux') return join(out, 'linux-unpacked', name.name);
  if (os === 'win') return join(out, 'win-unpacked', `${name.productName}.exe`);
  const dir = join(out, process.arch === 'x64' ? 'mac' : `mac-${process.arch}`);
  return join(dir, `${name.productName}.app`, 'Contents', 'MacOS', name.productName);
}

/** Packaged app processes still running; killed after each test so none outlives it. */
const started = new Set<ChildProcess>();

function start(
  executable: string,
  args: string[],
  env: Record<string, string>,
  cwd?: string,
): {
  child: ChildProcess;
  output: () => string;
  exit: Promise<number | null>;
  stop: () => Promise<void>;
} {
  const child = spawn(executable, args, { env, cwd });
  started.add(child);
  let output = '';
  child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  const exited = new Promise<number | null>((done) =>
    child.once('exit', (code) => (started.delete(child), done(code))),
  );
  const exit = new Promise<number | null>((done, fail) => {
    void exited.then(done);
    setTimeout(
      () => fail(new Error(`${executable} ${args.join(' ')} still runs after 60 s:\n${output}`)),
      60_000,
    ).unref();
  });
  exit.catch(() => undefined); // only an awaited `exit` reports the timeout
  // A running app quits on SIGTERM; SIGKILL after 15 s so a hung quit cannot leave it holding
  // the single-instance lock for the next launch.
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    const timer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    await exited;
    clearTimeout(timer);
  };
  return { child, output: () => output, exit, stop };
}

test.afterEach(() => {
  for (const child of started) child.kill('SIGKILL');
  started.clear();
});

const listening = (port: number) =>
  new Promise<boolean>((done) => {
    const socket = createConnection(port, '127.0.0.1');
    socket.once('connect', () => (socket.destroy(), done(true)));
    socket.once('error', () => done(false));
  });

test('SEC-02, SEC-04: packaged app has its fuses set, runs from bytecode and refuses debugging switches', async () => {
  const { readFuses } = (await import(
    pathToFileURL(join(root, 'packages/native/dist/build/index.js')).href
  )) as typeof NativeBuild;
  const executable = packagedExecutable();
  expect(existsSync(executable)).toBe(true);
  const fuses = await readFuses(executable);
  expect(fuses).toMatchObject({
    RunAsNode: 'disabled',
    EnableCookieEncryption: 'enabled',
    EnableNodeOptionsEnvironmentVariable: 'disabled',
    EnableNodeCliInspectArguments: 'disabled',
    EnableEmbeddedAsarIntegrityValidation: 'enabled',
    OnlyLoadAppFromAsar: 'enabled',
    GrantFileProtocolExtraPrivileges: 'disabled',
  });

  // The app is an ASAR whose main process is V8 bytecode: function sources are gone.
  const resources =
    os === 'mac' ? join(executable, '..', '..', 'Resources') : join(executable, '..', 'resources');
  const asar = readFileSync(join(resources, 'app.asar')).toString('latin1');
  expect(asar).toContain('blacklight-main.jsc');
  expect(asar).not.toContain('function isGameUrl(');
  expect(existsSync(join(resources, 'app'))).toBe(false);

  // It starts and works (the fixture writes the "boot" slot through the bridge)…
  const box = sandbox();
  const app = start(executable, KEYRING, box.env);
  await expect
    .poll(() => existsSync(join(box.dataDir, 'saves', 'boot.sav')), { timeout: 30_000 })
    .toBe(true);
  await app.stop();

  // …but not with a remote debugging port or an inspector.
  for (const args of [['--remote-debugging-port=5339'], ['--inspect=5338'], ['--devtools']]) {
    const refused = start(executable, [...args, ...KEYRING], box.env);
    expect(await refused.exit).toBe(1);
    expect(refused.output()).toContain('refusing to start with debugging switches');
    expect(await listening(5339)).toBe(false);
    expect(await listening(5338)).toBe(false);
  }

  // ELECTRON_RUN_AS_NODE is ignored: the binary does not turn into Node, it starts the game (which
  // writes the "boot" slot again) and never runs the `-e` script. KEYRING as in every launch: on
  // macOS the game waits on a Keychain access CI cannot answer without it.
  rmSync(join(box.dataDir, 'saves', 'boot.sav'), { force: true });
  const asNode = start(executable, ['-e', 'console.log("node-mode-" + 6 * 7)', ...KEYRING], {
    ...box.env,
    ELECTRON_RUN_AS_NODE: '1',
  });
  const booted = await expect
    .poll(() => existsSync(join(box.dataDir, 'saves', 'boot.sav')), { timeout: 30_000 })
    .toBe(true)
    .then(
      () => true,
      () => false,
    );
  expect(booted, `the game did not start under ELECTRON_RUN_AS_NODE=1:\n${asNode.output()}`).toBe(
    true,
  );
  await asNode.stop();
  expect(asNode.output()).not.toContain('node-mode-42');
  box.dispose();
});

/** Architectures of a Mach-O file (`lipo -archs`), e.g. `['x86_64', 'arm64']`. */
function machOArches(file: string): string[] {
  const lipo = spawnSync('lipo', ['-archs', file], { encoding: 'utf8' });
  expect(lipo.status, `lipo -archs ${file}: ${lipo.stderr}`).toBe(0);
  return lipo.stdout.trim().split(/\s+/).sort();
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

test('PF-05: steam target stages steamworks.js and writes depot scripts; upload runs as a dry run', async () => {
  test.setTimeout(900_000);
  // macOS: the real build, since the depot is a universal app whose binaries are checked below.
  run(
    'pnpm',
    ['exec', 'blacklight', 'build', '--target', 'steam', ...(os === 'mac' ? [] : ['--dry-run'])],
    fixture,
  );
  const steam = join(fixture, 'release', 'steam');
  if (os === 'mac') {
    // One .app holds x64 and arm64: the executables, the Electron framework and every native addon
    // are universal, except steamworks.js's two per-arch addons (it loads the one of process.arch).
    const { productName } = JSON.parse(
      readFileSync(join(steam, 'app', 'package.json'), 'utf8'),
    ) as { productName: string };
    const contents = join(steam, 'content', 'mac', `${productName}.app`, 'Contents');
    const both = ['arm64', 'x86_64'];
    expect(machOArches(join(contents, 'MacOS', productName))).toEqual(both);
    const framework = join(contents, 'Frameworks', 'Electron Framework.framework');
    expect(machOArches(join(framework, 'Electron Framework'))).toEqual(both);
    // The depot is self-contained: framework links stay relative.
    expect(readlinkSync(join(framework, 'Electron Framework'))).not.toMatch(/^\//);
    const unpacked = join(contents, 'Resources', 'app.asar.unpacked', 'native_modules');
    // Mach-O only: steamworks.js also ships its Linux and Windows addons.
    const machO = (f: string) =>
      [0xcffaedfe, 0xcafebabe].includes(readFileSync(f).subarray(0, 4).readUInt32BE(0));
    const addons = filesUnder(unpacked).filter((f) => /\.(node|dylib)$/.test(f) && machO(f));
    expect(addons.some((f) => f.endsWith('sdl.node'))).toBe(true);
    // Every Mach-O runs on both architectures: either it has both slices (extra ones are fine:
    // Valve's libsteam_api.dylib also carries i386), or it is one of steamworks.js's per-arch
    // addons, which its index.js picks by process.arch (checked by launching both slices below).
    const pair: string[] = [];
    for (const addon of addons) {
      const perArch = /steamworksjs\.darwin-(x64|arm64)\.node$/.exec(addon);
      if (perArch) {
        const arch = perArch[1] === 'x64' ? 'x86_64' : 'arm64';
        expect(machOArches(addon), addon).toEqual([arch]);
        pair.push(arch);
      } else {
        expect(machOArches(addon), addon).toEqual(expect.arrayContaining(both));
      }
    }
    expect(pair.sort()).toEqual(both);
    // Bytecode is per architecture (V8's snapshot checksum differs): both ship, no source.
    const asar = readFileSync(join(contents, 'Resources', 'app.asar')).toString('latin1');
    expect(asar).toContain('blacklight-main.x64.jsc');
    expect(asar).toContain('blacklight-main.arm64.jsc');
    expect(asar).not.toContain('function isGameUrl(');

    // Each slice starts and loads the steamworks.js addon of its architecture (the x64 one under
    // Rosetta): a wrong-arch addon fails to load and the app logs "steamworks.js is missing".
    // Without a Steam client the app either restarts through Steam (restartAppIfNecessary: it
    // quits with 0) or, when steam_appid.txt is found, runs and logs "Steam is not available".
    // Both prove the addon loaded and was called; the bytecode of that arch ran before it.
    // The first x86_64 start waits in dyld while Rosetta translates the fused Electron Framework
    // ahead of time (its bytes are new to this machine): over a minute on a runner, seen with
    // `sample` (stack in the Rosetta runtime under dyld mapping the framework). Players under
    // Rosetta pay that once; Intel Macs run the slice natively. The annotation records the time.
    const startTimeout = { arm64: 60_000, x86_64: 360_000 };
    for (const arch of ['arm64', 'x86_64'] as const) {
      const box = sandbox();
      writeFileSync(join(box.dir, 'steam_appid.txt'), '480');
      const started = Date.now();
      const slice = start(
        'arch',
        [`-${arch}`, join(contents, 'MacOS', productName), ...KEYRING],
        { ...box.env, SteamAppId: '480' },
        box.dir,
      );
      const loaded = () =>
        slice.output().includes('Steam is not available') ||
        (slice.child.exitCode === 0 && !slice.output().includes('steamworks.js is missing'));
      const ok = await expect
        .poll(loaded, { timeout: startTimeout[arch] })
        .toBe(true)
        .then(
          () => true,
          () => false,
        );
      const loadedAt = Date.now();
      const state = `exit ${slice.child.exitCode}, signal ${slice.child.signalCode}`;
      await slice.stop();
      expect(ok, `${arch} slice did not load steamworks.js (${state}):\n${slice.output()}`).toBe(
        true,
      );
      expect(slice.output(), `${arch} slice`).not.toContain('steamworks.js is missing');
      test.info().annotations.push({
        type: `steam ${arch}`,
        description: `${
          slice.output().includes('Steam is not available')
            ? 'addon loaded, Steam not running'
            : 'addon loaded, restartAppIfNecessary quit the app'
        } (${Math.round((loadedAt - started) / 1000)} s)`,
      });
      box.dispose();
    }
  }
  const manifest = JSON.parse(readFileSync(join(steam, 'app', 'blacklight.json'), 'utf8'));
  expect(manifest.steam).toEqual({ appId: 480 });
  expect(existsSync(join(steam, 'app', 'native_modules', 'steamworks.js', 'package.json'))).toBe(
    true,
  );
  const script = readFileSync(join(steam, 'scripts', 'app_build_480.vdf'), 'utf8');
  expect(script).toContain('"AppID" "480"');
  const depot = { win: 481, mac: 482, linux: 483 }[os];
  expect(script).toContain(`"${depot}" "depot_build_${depot}.vdf"`);
  const upload = spawnSync(
    process.execPath,
    [join(root, 'packages/cli/dist/cli.js'), 'upload', fixture, '--target', 'steam', '--dry-run'],
    { encoding: 'utf8' },
  );
  expect(upload.status).toBe(0);
  expect(upload.stdout).toContain(
    '[dry-run] steamcmd +login $STEAM_USERNAME +run_app_build -preview',
  );
  expect(upload.stdout).toContain('app_build_480.vdf +quit');
});

test.afterAll(() => {
  // Packaged apps are large: keep the disk clean between runs.
  for (const dir of [join(fixture, 'release'), join(fixture, 'dist')])
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

declare global {
  interface Window {
    blacklightNative?: NativeBridge;
  }
}
