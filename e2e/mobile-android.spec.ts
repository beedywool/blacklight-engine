// Phase 3d gate on an Android emulator: the fixture and a template launch offline from the
// embedded assets, real touch events (adb input) reach the game, the Android back button reaches
// the `back` action, and an encrypted save survives an app restart. Needs a booted emulator or
// device (`adb devices`) and BLACKLIGHT_E2E_ANDROID=1; CI runs it in the android job.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _android, expect, test, type AndroidDevice, type Page } from '@playwright/test';
import { run } from './server';

const repo = resolve(import.meta.dirname, '..');
const fixture = join(repo, 'e2e/fixtures/mobile');
const template = join(repo, 'templates/persona-menu');
const FIXTURE_ID = 'dev.blacklight.fixture.mobile';
const TEMPLATE_ID = 'com.example.personamenu';

test.skip(
  !process.env.BLACKLIGHT_E2E_ANDROID,
  'set BLACKLIGHT_E2E_ANDROID=1 with an emulator running',
);
test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);

let device: AndroidDevice;

function adb(...args: string[]): string {
  const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
  const result = spawnSync('adb', [...serial, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`adb ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function screenshot(): Buffer {
  const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
  return spawnSync('adb', [...serial, 'exec-out', 'screencap', '-p']).stdout;
}

function install(apk: string, id: string): void {
  spawnSync('adb', ['uninstall', id]);
  adb('install', '-r', apk);
}

async function launch(id: string): Promise<Page> {
  adb('shell', 'am', 'force-stop', id);
  // Playwright lists WebViews by polling: wait until the stopped process's one is gone, or
  // webView() would return it and page() would hang on its dead socket.
  await expect
    .poll(() => device.webViews().some((view) => view.pkg() === id), { timeout: 20_000 })
    .toBe(false);
  adb('shell', 'am', 'start', '-W', '-n', `${id}/.MainActivity`);
  const webview = await device.webView({ pkg: id }, { timeout: 60_000 });
  const page = await webview.page();
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running', {
    timeout: 60_000,
  });
  // Touches only reach the game once the WebView has window focus.
  await expect.poll(() => page.evaluate(() => document.hasFocus()), { timeout: 20_000 }).toBe(true);
  return page;
}

/** Taps the screen through Android's input pipeline at a CSS position of the WebView. */
async function tap(page: Page, cssX: number, cssY: number): Promise<void> {
  const ratio = await page.evaluate(() => devicePixelRatio);
  adb('shell', 'input', 'tap', String(Math.round(cssX * ratio)), String(Math.round(cssY * ratio)));
}

test.beforeAll(async () => {
  // CI builds the APKs before this file runs: Playwright gives a `beforeAll` hook the project
  // timeout (180 s in playwright.config.ts), which a cold Gradle build does not fit, and
  // `test.setTimeout` on the file does not reach hooks. A local run builds them here, which needs
  // a warm Gradle cache.
  if (!process.env.BLACKLIGHT_E2E_ANDROID_PREBUILT) {
    // --sqlite: native SQLite in the fixture, which drives the raw `sqlite` protocol.
    run('pnpm', ['exec', 'blacklight', 'build', '--target', 'android', '--sqlite'], fixture);
    run('pnpm', ['exec', 'blacklight', 'build', '--target', 'android'], template);
  }
  [device] = await _android.devices({ omitDriverInstall: true });
  if (!device) throw new Error('No Android device: start an emulator first (adb devices).');
  // The system's "viewing full screen" tip would cover the game on first launch.
  adb('shell', 'settings', 'put', 'secure', 'immersive_mode_confirmations', 'confirmed');
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable');
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
  const reachable = () =>
    spawnSync('adb', [...serial, 'shell', 'ping', '-c1', '-W2', '8.8.8.8']).status === 0;
  for (let i = 0; i < 15 && reachable(); i++) await new Promise((wait) => setTimeout(wait, 1000));
  expect(reachable()).toBe(false);
});

test.afterAll(async () => {
  if (!device) return;
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable');
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  await device.close();
});

test('the persona-menu template launches offline', async () => {
  install(join(template, 'release/android/persona-menu-0.1.0-debug.apk'), TEMPLATE_ID);
  const errors: string[] = [];
  const page = await launch(TEMPLATE_ID);
  page.on('pageerror', (error) => errors.push(error.message));
  // The network is really gone for the app, and the game still came up from embedded files.
  const external = await page.evaluate(() =>
    fetch('https://example.com/', { mode: 'no-cors' }).then(
      () => 'reachable',
      () => 'offline',
    ),
  );
  expect(external).toBe('offline');
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-scene', 'title');
  expect(await page.evaluate(() => location.origin)).toBe('https://localhost');
  await page.waitForTimeout(1000);
  await test.info().attach('template.png', {
    body: screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});

test('touch, back button and an encrypted save that survives a restart', async () => {
  install(join(fixture, 'release/android/mobile-gate-1.2.3-debug.apk'), FIXTURE_ID);
  let page = await launch(FIXTURE_ID);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-platform', 'android');
  await expect(mount).toHaveAttribute('data-restored', 'none');
  await expect(mount).toHaveAttribute('data-location', /\/data\/user\/0\/.*\/files\/blacklight$/);
  // Landscape lock from game.config.ts.
  const size = await page.evaluate(() => [innerWidth, innerHeight]);
  expect(size[0]).toBeGreaterThan(size[1]!);

  // The engine's native plugin answers; without mobile.playGamesAppId Google's SDK is left out.
  const games = await page.evaluate(() =>
    (
      window as unknown as {
        Capacitor: { Plugins: Record<string, { unlock(o: object): Promise<void> }> };
      }
    ).Capacitor.Plugins.BlacklightGames!.unlock({ id: 'first_win' }).then(
      () => 'resolved',
      (error: Error) => error.message,
    ),
  );
  expect(games).toMatch(/not in this build: set mobile\.playGamesAppId/);

  for (let i = 1; i <= 3; i++) {
    await tap(page, size[0]! / 2, size[1]! / 2);
    await expect(mount).toHaveAttribute('data-taps', String(i));
  }
  await expect(mount).toHaveAttribute('data-device', 'touch');
  await expect(mount).toHaveAttribute('data-saved', '3');
  // Capacitor SQLite behind platform.invoke('sqlite', …): rows, a blob and a boolean.
  await expect(mount).toHaveAttribute('data-sql', '3');
  await expect(mount).toHaveAttribute('data-insert', '1:true');
  await expect(mount).toHaveAttribute('data-blob', 'ok');

  // A deep link with the game id as scheme reaches the running game.
  adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `${FIXTURE_ID}://tap`);
  await expect(mount).toHaveAttribute('data-device', 'link');
  await expect(mount).toHaveAttribute('data-saved', '4');

  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  await expect(mount).toHaveAttribute('data-back', '1');
  // Back is a game action: the app stays in the foreground.
  expect(adb('shell', 'dumpsys', 'activity', 'activities')).toContain(
    `${FIXTURE_ID}/.MainActivity`,
  );

  // Background and foreground: the loop pauses and resumes without losing the scene.
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await expect(mount).toHaveAttribute('data-lifecycle', 'paused');
  adb('shell', 'am', 'start', '-W', '-n', `${FIXTURE_ID}/.MainActivity`);
  await expect(mount).toHaveAttribute('data-lifecycle', 'resumed');
  await expect.poll(() => page.evaluate(() => document.hasFocus()), { timeout: 20_000 }).toBe(true);
  await tap(page, size[0]! / 2, size[1]! / 2);
  await expect(mount).toHaveAttribute('data-taps', '5');
  await expect(mount).toHaveAttribute('data-saved', '5');

  page = await launch(FIXTURE_ID);
  await expect(page.locator('#game')).toHaveAttribute('data-restored', '5');
  await expect(page.locator('#game')).toHaveAttribute('data-sql', '5');
  // The file on disk is ciphertext: 12-byte IV, one encrypted digit, 16-byte GCM tag.
  const bytes = adb(
    'shell',
    'run-as',
    FIXTURE_ID,
    'stat',
    '-c',
    '%s',
    'files/blacklight/saves/taps.sav',
  );
  expect(Number(bytes.trim())).toBe(12 + 1 + 16);
  expect(adb('shell', 'run-as', FIXTURE_ID, 'ls', 'files/blacklight/saves')).not.toContain('.tmp');
  await test.info().attach('fixture.png', {
    body: screenshot(),
    contentType: 'image/png',
  });
});

test('a signed release build runs with WebView inspection off (SEC-07)', async () => {
  const keys = mkdtempSync(join(tmpdir(), 'blacklight-keystore-'));
  const keystore = join(keys, 'upload.jks');
  const keytool = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'keytool') : 'keytool';
  // Throwaway key: the store password lives in this test only.
  const created = spawnSync(keytool, [
    '-genkeypair',
    '-keystore',
    keystore,
    '-alias',
    'upload',
    '-keyalg',
    'RSA',
    '-keysize',
    '2048',
    '-validity',
    '1',
    '-storepass',
    'e2e-pass',
    '-keypass',
    'e2e-pass',
    '-dname',
    'CN=Blacklight e2e',
  ]);
  expect(created.status).toBe(0);
  const env = {
    ...process.env,
    ANDROID_KEYSTORE: keystore,
    ANDROID_KEYSTORE_PASSWORD: 'e2e-pass',
    ANDROID_KEY_ALIAS: 'upload',
  };
  const build = spawnSync(
    'pnpm',
    ['exec', 'blacklight', 'build', '--target', 'android', '--release'],
    {
      cwd: fixture,
      env,
      stdio: 'inherit',
    },
  );
  rmSync(keys, { recursive: true, force: true });
  expect(build.status).toBe(0);

  const apk = join(fixture, 'release/android/mobile-gate-1.2.3.apk');
  install(apk, FIXTURE_ID);
  adb('shell', 'am', 'start', '-W', '-n', `${FIXTURE_ID}/.MainActivity`);
  await expect
    .poll(() => adb('shell', 'pidof', FIXTURE_ID).trim(), { timeout: 30_000 })
    .not.toBe('');
  const pid = adb('shell', 'pidof', FIXTURE_ID).trim();
  // What the installed APK asks for, read from the APK: Capacitor only turns inspection on when
  // this is true.
  const packaged = spawnSync('unzip', ['-p', apk, 'assets/capacitor.config.json'], {
    encoding: 'utf8',
  });
  expect(packaged.status).toBe(0);
  const config = JSON.parse(packaged.stdout) as {
    android: { webContentsDebuggingEnabled: boolean };
  };
  expect(config.android.webContentsDebuggingEnabled).toBe(false);
  // A released game is not a debuggable package either (`run-as` and the debugger refuse one).
  expect(adb('shell', 'dumpsys', 'package', FIXTURE_ID)).not.toContain('flags=[ DEBUGGABLE');
  // Android exposes every WebView on a userdebug build to DevTools whatever the app sets
  // (`Build.IS_DEBUGGABLE`), and the CI emulator image is one. The socket check is for user builds,
  // which is what players install.
  if (adb('shell', 'getprop', 'ro.debuggable').trim() === '0') {
    // Give the WebView time to start; a debug build has opened its DevTools socket by then.
    await new Promise((wait) => setTimeout(wait, 5000));
    expect(adb('shell', 'cat', '/proc/net/unix')).not.toContain(`webview_devtools_remote_${pid}`);
  }
  expect(adb('shell', 'dumpsys', 'activity', 'activities')).toContain(
    `${FIXTURE_ID}/.MainActivity`,
  );
});
