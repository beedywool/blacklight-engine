// Phase 3d, everywhere CI runs: `blacklight build --target android --dry-run` generates the
// Capacitor project from the fixture, and its embedded web bundle runs in Chromium with phone
// emulation (touch) against a fake Capacitor native side (e2e/mobile/fake-native.ts). The real
// device run is e2e/mobile-android.spec.ts.
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { devices, expect, test } from '@playwright/test';
import { installFakeNative } from './mobile/fake-native';
import { run } from './server';

const repo = resolve(import.meta.dirname, '..');
const fixture = join(repo, 'e2e/fixtures/mobile');
const project = join(fixture, '.blacklight/mobile');
const www = join(project, 'www');
const port = 5340;
const url = `http://localhost:${port}/`;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
let server: Server;

test.use({ ...devices['Pixel 7 landscape'] });

test.beforeAll(async () => {
  run('pnpm', ['exec', 'blacklight', 'build', '--target', 'android', '--dry-run'], fixture);
  // The WebView serves the embedded files; a plain static server stands in for it.
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', url).pathname;
    try {
      const file = join(www, path === '/' ? 'index.html' : path);
      if (!file.startsWith(www)) throw new Error('outside');
      response.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(port, done));
});

test.afterAll(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

test('the generated Android project follows game.config.ts', () => {
  const android = join(project, 'android/app');
  const manifest = readFileSync(join(android, 'src/main/AndroidManifest.xml'), 'utf8');
  expect(manifest).toContain('android:screenOrientation="sensorLandscape"');
  expect(manifest).toContain('<data android:scheme="@string/custom_url_scheme" />');
  const strings = readFileSync(join(android, 'src/main/res/values/strings.xml'), 'utf8');
  expect(strings).toContain('<string name="app_name">Mobile Gate</string>');
  expect(strings).toContain(
    '<string name="custom_url_scheme">dev.blacklight.fixture.mobile</string>',
  );
  const gradle = readFileSync(join(android, 'build.gradle'), 'utf8');
  expect(gradle).toContain('applicationId "dev.blacklight.fixture.mobile"');
  expect(gradle).toContain('versionCode 1002003');
  expect(gradle).toContain('versionName "1.2.3"');
  expect(gradle).toContain('BLACKLIGHT_ANDROID_KEYSTORE');
  const config = JSON.parse(
    readFileSync(join(android, 'src/main/assets/capacitor.config.json'), 'utf8'),
  ) as { android: { webContentsDebuggingEnabled: boolean }; plugins: { SystemBars: object } };
  expect(config.android.webContentsDebuggingEnabled).toBe(true);
  expect(config.plugins.SystemBars).toMatchObject({ hidden: true });
  const plugins = readFileSync(join(android, 'src/main/assets/capacitor.plugins.json'), 'utf8');
  for (const name of [
    'BlacklightGamesPlugin',
    'AppPlugin',
    'FilesystemPlugin',
    'HapticsPlugin',
    'KeepAwakePlugin',
    'SecureStoragePluginPlugin',
  ]) {
    expect(plugins).toContain(name);
  }
  // Embedded assets: the web build is inside the APK's assets, nothing is fetched remotely.
  const index = readFileSync(join(android, 'src/main/assets/public/index.html'), 'utf8');
  expect(index).toMatch(/src="\.\/assets\/index-[\w-]+\.js"/);
  expect(index).not.toMatch(/https?:\/\//);
  // Release-only tooling stays out of the bundle.
  const entry = readFileSync(join(www, index.match(/assets\/index-[\w-]+\.js/)![0]), 'utf8');
  expect(entry).not.toContain('installDebug');
});

test('in a browser the mobile bundle stays a web game', async ({ page }) => {
  await page.goto(url);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect(mount).toHaveAttribute('data-platform', 'web');
});

test('touch, back button and a save that survives a restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installFakeNative, 'dev.blacklight.fixture.mobile');
  await page.goto(url);
  const mount = page.locator('#game');
  await expect(mount).toHaveAttribute('data-blacklight-state', 'running', { timeout: 30_000 });
  await expect(mount).toHaveAttribute('data-platform', 'android');
  await expect(mount).toHaveAttribute('data-restored', 'none');
  await expect(mount).toHaveAttribute(
    'data-location',
    'file:///data/user/0/dev.blacklight.fixture.mobile/files/blacklight',
  );
  const calls = () =>
    page.evaluate(() =>
      ((window as unknown as { __nativeCalls: [string][] }).__nativeCalls ?? []).map(([n]) => n),
    );
  expect(await calls()).toEqual(
    expect.arrayContaining(['KeepAwake.keepAwake', 'SystemBars.hide', 'App.addListener']),
  );

  const size = page.viewportSize()!;
  for (let i = 1; i <= 2; i++) {
    await page.touchscreen.tap(size.width / 2, size.height / 2);
    await expect(mount).toHaveAttribute('data-taps', String(i));
  }
  await expect(mount).toHaveAttribute('data-device', 'touch');
  await expect(mount).toHaveAttribute('data-saved', '2');

  const fire = (plugin: string, event: string) =>
    page.evaluate(
      ([p, e]) =>
        (window as unknown as { __fireNative: (p: string, e: string) => void }).__fireNative(
          p!,
          e!,
        ),
      [plugin, event],
    );
  await fire('App', 'backButton');
  await expect(mount).toHaveAttribute('data-back', '1');
  await fire('App', 'backButton');
  await expect(mount).toHaveAttribute('data-back', '2');

  // The file holds ciphertext, the key sits in secure storage.
  const stored = await page.evaluate(() => ({
    save: localStorage.getItem('fake-native:file:blacklight/saves/taps.sav'),
    key: localStorage.getItem('fake-native:secure:blacklight.saveKey'),
    temp: localStorage.getItem('fake-native:file:blacklight/saves/taps.sav.tmp'),
  }));
  expect(atob(stored.save!)).toHaveLength(12 + 1 + 16); // iv + one digit + GCM tag
  expect(atob(stored.key!)).toHaveLength(32);
  expect(stored.temp).toBeNull();

  await page.reload();
  await expect(mount).toHaveAttribute('data-restored', '2', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
