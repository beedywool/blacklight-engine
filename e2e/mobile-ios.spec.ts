// Phase 3d gate on the iOS Simulator (macOS with Xcode, BLACKLIGHT_E2E_IOS=1; CI runs it in the
// ios job). Playwright cannot attach to WKWebView, so the fixture reports to `status.json` in its
// app container: the app launches with its embedded files, a deep link (`<id>://tap`) makes an
// encrypted save with the Keychain key, and the save is read back after a relaunch. Real touches
// on iOS are in MANUAL_TESTS.md; the touch path is the same JavaScript the web and Android runs
// check.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { run } from './server';

const repo = resolve(import.meta.dirname, '..');
const fixture = join(repo, 'e2e/fixtures/mobile');
const ID = 'dev.blacklight.fixture.mobile';

test.skip(!process.env.BLACKLIGHT_E2E_IOS, 'set BLACKLIGHT_E2E_IOS=1 on macOS with Xcode');
test.setTimeout(900_000);

let udid: string;

function simctl(...args: string[]): string {
  const result = spawnSync('xcrun', ['simctl', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`simctl ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function status(): Record<string, string> | undefined {
  const file = join(
    simctl('get_app_container', udid, ID, 'data'),
    'Documents/blacklight/status.json',
  );
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  } catch {
    return undefined; // being replaced
  }
}

/**
 * The Simulator's screen as PNG bytes. `simctl io screenshot -` gave an empty attachment on the CI
 * runner, so it goes through a file.
 */
function screenshot(): Buffer | undefined {
  const file = join(mkdtempSync(join(tmpdir(), 'blacklight-ios-')), 'screen.png');
  const result = spawnSync('xcrun', ['simctl', 'io', udid, 'screenshot', file]);
  try {
    return result.status === 0 && existsSync(file) ? readFileSync(file) : undefined;
  } finally {
    rmSync(dirname(file), { recursive: true, force: true });
  }
}

async function until(
  check: (s: Record<string, string>) => boolean,
): Promise<Record<string, string>> {
  let last: Record<string, string> | undefined;
  try {
    await expect
      .poll(
        () => {
          last = status();
          return last ? check(last) : false;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
  } catch (error) {
    // Without the last status the failure says only "false", which cannot tell a deep link that
    // never arrived from a save that failed after it did. The screen and the app's log tell what
    // the status cannot (a system alert, a crash, a WebView error).
    const screen = screenshot();
    if (screen) await test.info().attach('failure.png', { body: screen, contentType: 'image/png' });
    const log = spawnSync(
      'xcrun',
      [
        'simctl',
        'spawn',
        udid,
        'log',
        'show',
        '--last',
        '3m',
        '--style',
        'compact',
        '--predicate',
        'process == "App"',
      ],
      { encoding: 'utf8', maxBuffer: 64 << 20 },
    );
    await test
      .info()
      .attach('app.log', { body: log.stdout || log.stderr, contentType: 'text/plain' });
    throw new Error(`${(error as Error).message}\nLast status.json: ${JSON.stringify(last)}`, {
      cause: error,
    });
  }
  return last!;
}

test.beforeAll(() => {
  run('pnpm', ['exec', 'blacklight', 'build', '--target', 'ios'], fixture);
  const devices = JSON.parse(simctl('list', 'devices', 'available', '-j')) as {
    devices: Record<string, { udid: string; name: string; state: string }[]>;
  };
  const phones = Object.entries(devices.devices)
    .filter(([runtime]) => runtime.includes('iOS'))
    .flatMap(([, list]) => list)
    .filter((device) => device.name.startsWith('iPhone'));
  const phone = phones.find((device) => device.state === 'Booted') ?? phones.at(-1);
  if (!phone)
    throw new Error('No iPhone simulator available: install one in Xcode → Settings → Platforms.');
  udid = phone.udid;
  if (phone.state !== 'Booted') simctl('boot', udid);
  simctl('bootstatus', udid, '-b');
});

test('the fixture launches, saves with the Keychain key and reads the save after a relaunch', async () => {
  spawnSync('xcrun', ['simctl', 'uninstall', udid, ID]);
  simctl('install', udid, join(fixture, 'release/ios/mobile-gate.app'));
  simctl('launch', udid, ID);
  const first = await until((s) => s.restored === 'none' && s.platform === 'ios');
  expect(first.location).toMatch(/^file:\/\/.*\/Documents\/blacklight$/);

  simctl('openurl', udid, `${ID}://tap`);
  await until((s) => s.saved === '1' && s.device === 'link');
  const save = join(
    simctl('get_app_container', udid, ID, 'data'),
    'Documents/blacklight/saves/taps.sav',
  );
  expect(statSync(save).size).toBe(12 + 1 + 16);

  simctl('terminate', udid, ID);
  simctl('launch', udid, ID);
  await until((s) => s.restored === '1');
  const screen = screenshot();
  if (screen) await test.info().attach('ios.png', { body: screen, contentType: 'image/png' });
});
