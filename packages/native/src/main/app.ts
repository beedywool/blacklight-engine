// The Electron main process of a Blacklight game (PF-02): serves the web build through a
// privileged `app://` scheme (fetch works offline, unlike file://), opens one sandboxed window
// with context isolation and no Node, and answers the page's native calls from an allowlist.

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import Module, { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  Menu,
  app,
  ipcMain,
  net,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { GAME_CONTROLLER_DB } from '../../../core/src/input/gamecontrollerdb';
import { CHANNELS, type InvokeResult, type NativeInfo } from '../bridge';
import type { NativeModule } from '../define-native';
// Bundled from source (like the controller database): the relay is a server package, not built
// with the engine packages.
import { relayNativeModule } from '../../../../servers/relay/src/native';
import { startDiscord } from './discord';
import {
  DeepLinks,
  registerNativeExports,
  startNativeModules,
  startSecureStorage,
} from './modules';
import { dataFolder, defaultDataDir } from './files';
import { loadSaveKey } from './keystore';
import { APP_HOST, APP_ORIGIN, APP_SCHEME, type AppManifest } from './manifest';
import { addEventSink, callNative, emitToGame, method, registerNative } from './registry';
import { startGamepads, type SdlBinding } from './sdl';
import { classifyKey, debugSwitches } from './security';
import { startSteam, type Steamworks } from './steam';
import { v } from './validate';
import { heightForRatio, windowSizes } from './window';

/** Permissions a game page may get; everything else (camera, location, notifications…) is denied. */
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);

/** Options of {@link startApp}. */
export interface StartOptions {
  /** Folder holding `blacklight.json`, `preload.cjs` and the web build. @defaultValue the main script's folder */
  appDir?: string;
}

function readManifest(dir: string): AppManifest {
  const file = join(dir, 'blacklight.json');
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as AppManifest;
  } catch (error) {
    throw new Error(
      `Cannot read ${file} (${(error as Error).message}). Build the app with \`blacklight build --target <win|mac|linux|steam>\`.`,
      { cause: error },
    );
  }
}

/**
 * Starts the desktop app. The CLI generates a `main.cjs` that calls it; games never call it
 * themselves.
 *
 * @example
 * ```js
 * // main.cjs (generated)
 * require('@blacklight/native/main').startApp({ appDir: __dirname });
 * ```
 */
export function startApp(options: StartOptions = {}): void {
  const dir = options.appDir ?? __dirname;
  const manifest = readManifest(dir);
  const hardened = manifest.release && manifest.security.devtools;

  // SEC-01: a packaged release build never runs with a debugger or remote developer tools. The
  // fuses already turn --inspect off; Chromium switches are refused here, before anything loads.
  // Unpackaged runs (tests, `blacklight desktop`) keep them so Playwright can drive the app.
  if (hardened && app.isPackaged) {
    const found = debugSwitches(process.argv);
    if (found.length > 0) {
      console.error(`[blacklight] refusing to start with debugging switches: ${found.join(', ')}`);
      app.exit(1);
      return;
    }
  }

  app.setName(manifest.name);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        codeCache: true,
      },
    },
  ]);

  // Native parts of modules require their addons (better-sqlite3…) by name: resolve them from
  // native_modules/ too.
  process.env.NODE_PATH = [join(dir, 'native_modules'), process.env.NODE_PATH]
    .filter(Boolean)
    .join(process.platform === 'win32' ? ';' : ':');
  (Module as unknown as { _initPaths(): void })._initPaths();
  const nodeRequire = createRequire(join(dir, 'main.cjs'));
  // Native addons ship in native_modules/ (outside node_modules, which electron-builder rebuilds).
  const requireNative = (name: string): unknown => {
    try {
      return nodeRequire(join(dir, 'native_modules', name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error;
      return nodeRequire(name);
    }
  };
  let steamworks: Steamworks | undefined;
  if (manifest.steam) {
    try {
      steamworks = requireNative('steamworks.js') as Steamworks;
      if (app.isPackaged && steamworks.restartAppIfNecessary(manifest.steam.appId)) {
        app.quit();
        return;
      }
      // L3: Chromium draws off the GPU thread Steam hooks; these switches let the overlay attach.
      steamworks.electronEnableSteamOverlay();
    } catch (error) {
      console.warn(
        `[blacklight] steamworks.js is missing from the app: ${(error as Error).message}`,
      );
      steamworks = undefined;
    }
  }

  const dataDir = defaultDataDir(manifest.id, manifest.save.location);
  const files = dataFolder(dataDir);
  const info: NativeInfo = {
    platform: process.platform as NativeInfo['platform'],
    steam: false,
    release: manifest.release,
    dataDir,
    version: manifest.version,
  };
  let window: BrowserWindow | undefined;

  app.whenReady().then(() => {
    serveGame(
      join(dir, manifest.gameDir ?? 'game'),
      manifest.release ? manifest.security.csp : null,
    );
    registerBuiltins();
    if (steamworks && manifest.steam)
      info.steam = startSteam(steamworks, manifest.steam.appId) !== undefined;
    if (manifest.discord) startDiscord(manifest.discord.appId, emitToGame);
    startSdl();
    startSecureStorage(join(app.getPath('userData'), 'secure-storage.bin'), safeStorage);
    startLanRelay();
    const context = { gameId: manifest.id, dataDir, dev: !manifest.release };
    const ready = startNativeModules(loadNatives(), context).then((dispose) => {
      app.once('will-quit', () => void dispose());
    });

    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(ALLOWED_PERMISSIONS.has(permission)),
    );
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      ALLOWED_PERMISSIONS.has(permission),
    );
    // Module setup (opening databases…) finishes before the game can call them.
    void ready.then(
      () => (window = createWindow()),
      (error: unknown) => {
        console.error('[blacklight] a native module failed to start:', error);
        app.exit(1);
      },
    );
  });

  app.on('second-instance', (_event, argv) => {
    links.fromArgv(argv);
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  // OAuth redirects and invitations come back as `<game id>:/…` URLs (macOS: open-url; Windows
  // and Linux: the command line of a second instance, or of this one).
  const links = new DeepLinks(manifest.id);
  app.setAsDefaultProtocolClient(manifest.id);
  app.on('open-url', (event, url) => {
    event.preventDefault();
    links.receive(url);
  });
  links.fromArgv(process.argv);

  // The preload asks before the page's document exists, so the frame URL is not known yet: the
  // window is enough (the info is not secret; native calls check the page's origin).
  ipcMain.on('blacklight:info', (event) => {
    event.returnValue = window && event.sender === window.webContents ? info : null;
  });
  ipcMain.handle(
    CHANNELS.invoke,
    async (event, module: unknown, name: unknown, args: unknown): Promise<InvokeResult> => {
      if (!isGameFrame(event))
        return { ok: false, error: 'Native calls are only allowed from the game page.' };
      try {
        return { ok: true, value: await callNative(module, name, args) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  addEventSink((event, payload) => window?.webContents.send(CHANNELS.event, event, payload));

  /** Only the game's own top frame may use the bridge (not iframes, not other origins). */
  function isGameFrame(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): boolean {
    const frame = event.senderFrame;
    if (
      !frame ||
      frame !== event.sender.mainFrame ||
      !window ||
      event.sender !== window.webContents
    ) {
      return false;
    }
    return isGameUrl(frame.url);
  }

  /** `true` for pages of the game: `app://game/…`, or the dev server in dev runs. */
  function isGameUrl(url: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    // URL.origin is "null" for custom schemes: compare scheme and host instead.
    if (parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST) return true;
    return !!manifest.devServer && parsed.origin === new URL(manifest.devServer).origin;
  }

  function registerBuiltins(): void {
    const path = v.string({ min: 1, max: 512 });
    registerNative('files', {
      read: method([path], (p) => files.read(p)),
      write: method([path, v.bytes()], (p, data) => files.write(p, data)),
      remove: method([path], (p) => files.remove(p)),
      list: method([v.optional(v.string({ max: 512 }))], (prefix) => files.list(prefix)),
    });
    let key: Promise<Uint8Array> | undefined;
    registerNative('keystore', {
      saveKey: method(
        [],
        () => (key ??= loadSaveKey(join(app.getPath('userData'), 'save.key'), safeStorage)),
      ),
    });
    registerNative('window', {
      setFullscreen: method([v.boolean()], (on) => setFullscreen(on)),
      isFullscreen: method([], () => window?.isFullScreen() ?? false),
    });
    registerNative('shell', {
      openUrl: method([v.string({ max: 4096, pattern: /^(https?:|mailto:)/ })], (url) =>
        shell.openExternal(url),
      ),
      quit: method([], () => {
        setImmediate(() => app.quit());
      }),
    });
  }

  /** `relay`: hosts a LAN room from the desktop app (NET-01), the same server as the Docker image. */
  function startLanRelay(): void {
    const relay = relayNativeModule();
    registerNative('relay', {
      start: method(
        [v.optional(v.object({ port: v.optional(v.integer({ min: 1024, max: 65535 })) }))],
        (options) => relay.start(options),
      ),
      stop: method([], () => relay.stop()),
      status: method([], () => relay.status()),
    });
    app.once('will-quit', () => void relay.stop());
  }

  function startSdl(): void {
    // Only the controller subsystem is used; SDL must not open a window or an audio device next
    // to Chromium's, and must read pads while Electron's window (not an SDL one) has the focus.
    process.env.SDL_VIDEODRIVER ??= 'dummy';
    process.env.SDL_AUDIODRIVER ??= 'dummy';
    process.env.SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS ??= '1';
    let sdl: SdlBinding;
    try {
      sdl = requireNative('@kmamal/sdl') as SdlBinding;
    } catch (error) {
      console.warn(
        `[blacklight] SDL gamepads unavailable (${(error as Error).message}); the game reads pads through the browser Gamepad API.`,
      );
      return;
    }
    try {
      startGamepads(sdl, emitToGame, GAME_CONTROLLER_DB);
    } catch (error) {
      console.warn(`[blacklight] SDL gamepads could not start: ${(error as Error).message}`);
    }
  }

  function loadNatives(): NativeModule[] {
    const api = { registerNative, method, v, emitToGame };
    return (manifest.natives ?? []).flatMap((file) => {
      const path = resolve(dir, file);
      return registerNativeExports(path, nodeRequire(path), api);
    });
  }

  function settingsFile(): string {
    return join(app.getPath('userData'), 'window.json');
  }

  function readWindowSettings(): { fullscreen?: boolean } {
    try {
      return JSON.parse(readFileSync(settingsFile(), 'utf8')) as { fullscreen?: boolean };
    } catch {
      return {};
    }
  }

  /** Switches fullscreen and remembers the player's choice (next to the save key, not in the page's folder). */
  function setFullscreen(on: boolean): void {
    window?.setFullScreen(on);
    mkdir(dirname(settingsFile()), { recursive: true })
      .then(() => writeFile(settingsFile(), JSON.stringify({ fullscreen: on })))
      .catch(() => undefined);
  }

  function createWindow(): BrowserWindow {
    const design = manifest.resolution;
    const { size, minSize } = windowSizes(
      design,
      screen.getPrimaryDisplay().workAreaSize,
      manifest.window,
    );
    const ratio = design.width / design.height;
    const win = new BrowserWindow({
      title: manifest.name,
      width: size.width,
      height: size.height,
      minWidth: minSize.width,
      minHeight: minSize.height,
      useContentSize: true,
      resizable: manifest.window.resizable ?? true,
      fullscreen: readWindowSettings().fullscreen ?? manifest.window.fullscreen ?? false,
      backgroundColor: '#000000',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(dir, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        webviewTag: false,
        spellcheck: false,
        devTools: !hardened,
        // A game starts its music without waiting for a click.
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    // macOS keeps an app menu (Quit, Hide); no View menu, so no developer-tools item.
    Menu.setApplicationMenu(
      process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }]) : null,
    );
    win.setAspectRatio(ratio);
    let fitTimer: NodeJS.Timeout | undefined;
    const fit = () => {
      if (win.isDestroyed() || win.isFullScreen() || win.isMaximized()) return;
      const [width = 0, height = 0] = win.getContentSize();
      const target = heightForRatio({ width, height }, ratio);
      if (target !== undefined) win.setContentSize(width, target);
    };
    win.on('resize', () => {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(fit, 150);
    });
    win.on('leave-full-screen', () => setTimeout(fit, 50));
    win.once('ready-to-show', () => win.show());

    win.webContents.on('before-input-event', (event, input) => {
      const action = classifyKey(input);
      if (action === 'fullscreen') {
        event.preventDefault();
        setFullscreen(!win.isFullScreen());
      } else if (action === 'devtools' || action === 'reload') {
        if (hardened) event.preventDefault();
        else if (action === 'devtools' && input.code === 'F12') {
          event.preventDefault();
          win.webContents.toggleDevTools();
        }
      }
    });
    win.webContents.on('devtools-opened', () => {
      if (!hardened) return;
      win.webContents.closeDevTools();
      emitToGame('security:devtools', {});
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (!isGameUrl(url)) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('render-process-gone', (_event, details) =>
      console.error(`[blacklight] the game page stopped: ${details.reason} (${details.exitCode})`),
    );
    win.on('closed', () => {
      window = undefined;
    });
    void win.loadURL(gameUrl());
    if (!hardened && process.argv.includes('--devtools'))
      win.webContents.openDevTools({ mode: 'detach' });
    return win;
  }

  function gameUrl(): string {
    return manifest.devServer ?? `${APP_ORIGIN}/index.html`;
  }
}

/** Serves the web build from `app://game/`, with the release CSP on every response. */
function serveGame(root: string, csp: string | null): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Not found', { status: 404 });
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = resolve(root, `.${pathname}`);
    if (relative(root, file).startsWith('..')) return new Response('Forbidden', { status: 403 });
    const response = await net.fetch(pathToFileURL(file).toString()).catch(() => undefined);
    if (!response || !response.ok) return new Response('Not found', { status: 404 });
    const headers = new Headers(response.headers);
    if (csp) headers.set('Content-Security-Policy', csp);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: 200, headers });
  });
}
