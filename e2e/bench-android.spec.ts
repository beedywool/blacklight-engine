// NF-01, NF-02 (mobile half) and NF-03 on an Android emulator. Part of `pnpm bench` (the `bench`
// project), skipped unless BLACKLIGHT_E2E_ANDROID=1 and a booted emulator or device is attached
// (`adb devices`); CI runs it in the android job. Results go to bench-results/android-*.json and
// are compared like the desktop benchmarks: per-runner baseline in e2e/bench-baseline.json, 10 %
// tolerance (scripts/bench.mjs).
//
// What is measured is the signed release APK that `blacklight build --target android --release`
// writes (minified web bundle, Capacitor logging off, release Gradle build), with one change: the
// spec turns WebView inspection back on (`webContentsDebuggingEnabled` in the APK's
// capacitor.config.json, SEC-07) and rebuilds with Gradle, so that it can read the page's results
// through the DevTools protocol. A shipped release refuses that connection by design, and no
// other channel works on a release build: Capacitor's console logging is off, `run-as` refuses a
// non-debuggable app, and WebView does not offer its trace events to the system tracer (Perfetto)
// for non-debuggable apps on user builds. Only the spec makes this change; the CLI, the engine
// and the templates do not have a switch for it. An open inspection socket costs nothing until a
// client attaches; when one does, the spec attaches after the moment it times (NF-02) or before
// the measured window (NF-01).
//
// - NF-01: e2e/fixtures/bench (300 animated sprites under an animated UI screen) in landscape,
//   one fresh app process per run, five runs; the scene's own result (the same metrics as on
//   desktop), the JS heap after a garbage collection forced through the DevTools protocol (the
//   page cannot call gc() in a WebView) and the memory of the app's processes. Gated like on
//   desktop: the best run of `stepRelative`, `heapMb`, and fps and 1 % low when the baseline is
//   at 55 fps or more. There is no absolute fps check: an emulator is not an A54.
// - NF-02: party-game and visual-novel, nine launches each after `am force-stop` and `pm clear`
//   (no WebView cache, code cache or saved data: the first launch after installing). The time
//   runs from just before `am start` (device clock) to the `blacklight:interactive` mark
//   (`performance.timeOrigin` + the mark's `startTime`, the same clock). The spec attaches only
//   once 5 s have passed since the launch, so a start under the limit is never slowed by the
//   connection. Gated: the median under 5 s, and within 10 % of the baseline as on desktop.
// - NF-03: party-game, three sessions: the title screen (no DevTools connection yet), then four
//   simulated gamepads join, pick Survival VS and play; the memory of the app's processes is
//   sampled through the match. Memory is the proportional set size (PSS, `dumpsys meminfo`) of the
//   app process plus the WebView renderer process it binds (a separate sandboxed process that
//   holds the page). Gated: the peak under 300 MB and within 10 % of the baseline (best session).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _android, expect, test, type AndroidDevice, type Page } from '@playwright/test';
import { findAndroidSdk, findJava } from '../packages/cli/src/targets/mobile-tools';
import { best, compare, formatComparison, median, summarize } from '../scripts/bench.mjs';
import { RUNS, recordRuns } from './bench-shared';
import { run } from './server';

/** NF-02: first interactive screen under 5 s on mobile. */
const START_LIMIT_MS = 5000;
/** NF-03: under 300 MB on mobile for the party-game template. */
const MEMORY_LIMIT_MB = 300;
const LAUNCHES = Number(process.env.BLACKLIGHT_BENCH_LAUNCHES ?? 9);
/** Party sessions for NF-03. */
const SESSIONS = 3;
const MARK = 'blacklight:interactive';
const root = resolve(import.meta.dirname, '..');
const fixture = join(root, 'e2e/fixtures/bench');
const APPS = {
  bench: { dir: fixture, id: 'dev.blacklight.fixture.bench' },
  'party-game': { dir: join(root, 'templates/party-game'), id: 'com.example.partynight' },
  'visual-novel': { dir: join(root, 'templates/visual-novel'), id: 'com.example.neonrain' },
} as const;
type App = keyof typeof APPS;

test.skip(
  !process.env.BLACKLIGHT_E2E_ANDROID,
  'set BLACKLIGHT_E2E_ANDROID=1 with an emulator running',
);
test.describe.configure({ mode: 'serial' });

let device: AndroidDevice;
let keys: string;
/** Names the runner with the host CPU (bench-shared.ts): device, Android, WebView, GL renderer. */
let gpu = 'unknown';
/** WebView version, stored with every run: the Play Store updates it on its own. */
let webview = 'unknown';
const installed = new Set<App>();

function adb(...args: string[]): string {
  const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
  const result = spawnSync('adb', [...serial, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`adb ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
const round = (value: number) => Math.round(value * 10) / 10;

test.beforeAll(async () => {
  [device] = await _android.devices({ omitDriverInstall: true });
  if (!device) throw new Error('No Android device: start an emulator first (adb devices).');
  const prop = (name: string) => adb('shell', 'getprop', name).trim();
  const gles = /GLES: [^,]*, ([^\n]*?), OpenGL ES/.exec(adb('shell', 'dumpsys', 'SurfaceFlinger'));
  webview =
    /versionName=(\S+)/.exec(
      adb('shell', 'dumpsys', 'package', 'com.google.android.webview'),
    )?.[1] ?? 'unknown';
  // The WebView's major version is part of the runner: the same emulator gave a 40 % lower
  // stepRelative after the Play Store updated WebView 134 to 156, so a new WebView starts a new
  // baseline instead of failing (or hiding a regression) against the old one.
  gpu = `${prop('ro.product.model')} Android ${prop('ro.build.version.release')} WebView ${webview.split('.')[0]} · ${gles?.[1] ?? 'GLES unknown'}`;
  // Throwaway signing key: the password lives in this spec only.
  keys = mkdtempSync(join(tmpdir(), 'blacklight-bench-keystore-'));
  const keytool = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'keytool') : 'keytool';
  const created = spawnSync(keytool, [
    ...['-genkeypair', '-keystore', join(keys, 'upload.jks'), '-alias', 'upload'],
    ...['-keyalg', 'RSA', '-keysize', '2048', '-validity', '1'],
    ...['-storepass', 'bench-pass', '-keypass', 'bench-pass', '-dname', 'CN=Blacklight bench'],
  ]);
  expect(created.status, String(created.stderr)).toBe(0);
});

test.afterAll(async () => {
  for (const app of installed) spawnSync('adb', ['uninstall', APPS[app].id]);
  if (keys) rmSync(keys, { recursive: true, force: true });
  await device?.close();
});

/**
 * Release APK of `app` with WebView inspection on (see the top of this file), installed on the
 * device. `env` reaches the web build (the fixture's VITE_BENCH_STARTUP_DELAY_MS).
 */
function buildAndInstall(app: App, env: Record<string, string> = {}): void {
  const { dir, id } = APPS[app];
  const signing = {
    ANDROID_KEYSTORE: join(keys, 'upload.jks'),
    ANDROID_KEYSTORE_PASSWORD: 'bench-pass',
    ANDROID_KEY_ALIAS: 'upload',
  };
  run('pnpm', ['exec', 'blacklight', 'build', '--target', 'android', '--release'], dir, {
    ...signing,
    ...env,
  });
  const android = join(dir, '.blacklight/mobile/android');
  const config = join(android, 'app/src/main/assets/capacitor.config.json');
  const text = readFileSync(config, 'utf8');
  if (!text.includes('"webContentsDebuggingEnabled": false'))
    throw new Error(`${config}: expected a release config with WebView inspection off.`);
  writeFileSync(
    config,
    text.replace('"webContentsDebuggingEnabled": false', '"webContentsDebuggingEnabled": true'),
  );
  const javaHome = findJava();
  run(join(android, 'gradlew'), ['assembleRelease', '--console=plain', '-q'], android, {
    ...signing,
    ANDROID_HOME: findAndroidSdk(),
    ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  });
  spawnSync('adb', ['uninstall', id]);
  adb('install', join(android, 'app/build/outputs/apk/release/app-release.apk'));
  installed.add(app);
  // The APK the CLI wrote (without the change) is not used; packages are large.
  rmSync(join(dir, 'release'), { recursive: true, force: true });
}

/** Stops the app and waits until Playwright no longer lists its WebView. */
async function stop(id: string, clear = false): Promise<void> {
  adb('shell', 'am', 'force-stop', id);
  if (clear) adb('shell', 'pm', 'clear', id);
  await expect
    .poll(() => device.webViews().some((view) => view.pkg() === id), { timeout: 20_000 })
    .toBe(false);
}

/** Starts the app; returns the device clock just before `am start`, in ms since the epoch. */
function start(id: string): { launchedMs: number; activityMs: number } {
  const out = adb('shell', `date +%s%N; am start -W -n ${id}/.MainActivity`);
  const launchedMs = Number(BigInt(out.split('\n')[0]!.trim()) / 1000n) / 1000;
  return { launchedMs, activityMs: Number(/TotalTime: (\d+)/.exec(out)?.[1] ?? Number.NaN) };
}

async function attach(id: string): Promise<Page> {
  const view = await device.webView({ pkg: id }, { timeout: 60_000 });
  // Playwright connects to the WebView's DevTools socket with no time limit; on GitHub's emulator
  // one connection out of many never completed and held the test until its 15-minute timeout.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      view.page(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${id}: no DevTools connection to its WebView within 60 s`)),
          60_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * PSS in MB of the app process and of the WebView renderer process it binds (sandboxed, own
 * uid), from `dumpsys meminfo`.
 */
function memory(id: string): { appMb: number; rendererMb: number; totalMb: number } {
  const pss = (pid: string) => {
    const out = adb('shell', 'dumpsys', 'meminfo', pid);
    const total = /TOTAL PSS:\s+(\d+)/.exec(out);
    if (!total) throw new Error(`no meminfo for pid ${pid}:\n${out}`);
    return Number(total[1]) / 1024;
  };
  const app = adb('shell', 'pidof', id).trim();
  const services = adb('shell', 'dumpsys', 'activity', 'services', id);
  const renderers = [
    ...new Set(
      [...services.matchAll(/app=ProcessRecord\{\w+ (\d+):[^ }]*sandboxed_process/g)].map(
        (m) => m[1]!,
      ),
    ),
  ];
  if (!app || renderers.length === 0)
    throw new Error(`${id}: app process "${app}", renderer processes ${renderers.join(', ')}`);
  const appMb = pss(app);
  const rendererMb = renderers.reduce((sum, pid) => sum + pss(pid), 0);
  return { appMb: round(appMb), rendererMb: round(rendererMb), totalMb: round(appMb + rendererMb) };
}

// NF-01 ------------------------------------------------------------------------------------------

type BenchRun = Record<string, unknown>;

/**
 * One benchmark run in a fresh app process. With `query`, the page is reloaded at that URL once
 * the DevTools connection is up (the regression proof's `?burn=`).
 */
async function measureBench(query?: string): Promise<BenchRun> {
  const { id } = APPS.bench;
  await stop(id);
  start(id);
  const page = await attach(id);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (query !== undefined) await page.goto(`https://localhost/${query}`);
  await expect(page.locator('#game')).toHaveAttribute('data-bench', /frames/, { timeout: 60_000 });
  const result = (await page.evaluate(() => window.blacklightBench)) as BenchRun;
  // The scene's heapMb is `performance.memory` without a GC and in coarse steps (no
  // --enable-precise-memory-info in a WebView): kept as heapNoGcMb.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const heap = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
  await cdp.detach();
  expect(errors).toEqual([]);
  const { viewport, heapMb, ...metrics } = result as BenchRun & { viewport: unknown };
  return {
    ...metrics,
    heapMb: Math.round((heap.usedSize / 2 ** 20) * 100) / 100,
    heapNoGcMb: heapMb,
    ...Object.fromEntries(
      Object.entries(memory(id)).map(([key, value]) => [key.replace('Mb', 'PssMb'), value]),
    ),
    viewport: JSON.stringify(viewport),
    webview,
  };
}

async function measureBenchRuns(count: number, query?: string): Promise<BenchRun[]> {
  const runs: BenchRun[] = [];
  for (let i = 0; i < count; i++) runs.push(await measureBench(query));
  return runs;
}

test('NF-01: 300 animated sprites and an animated UI screen in the release app, within 10 % of the baseline', async (// eslint-disable-next-line no-empty-pattern
{}, testInfo) => {
  test.setTimeout(300_000 + 2 * RUNS * 60_000);
  buildAndInstall('bench');
  const runs = await measureBenchRuns(RUNS);
  const { rows } = await recordRuns({
    profile: 'android-bench',
    gpu,
    runs,
    more: () => measureBenchRuns(RUNS),
    testInfo,
  });
  const typical = summarize(runs);
  console.log(
    `[bench] android-bench: ${typical.fps} fps, 1 % low ${typical.low1Fps}, stepRelative ${typical.stepRelative}, heap ${typical.heapMb} MB, PSS ${typical.totalPssMb} MB (median of ${runs.length})`,
  );
  expect(
    rows.filter((row) => row.regressed).map((row) => row.metric),
    formatComparison(rows),
  ).toEqual([]);
});

// Proof, as in e2e/bench.spec.ts: busy work worth 30 % of the frame's own cost added to every
// frame (`?burn=`, read by the fixture only) must be reported as a regression against clean runs
// taken just before; the clean runs compared with themselves must not.
test('NF-01: the regression check fails when every frame does 30 % more work', async () => {
  test.setTimeout(600_000);
  if (!installed.has('bench')) buildAndInstall('bench');
  const cleanRuns = await measureBenchRuns(3, '');
  const clean = best(cleanRuns);
  const burnMs = Math.max(0.01, Number((summarize(cleanRuns).stepMs! * 0.3).toFixed(3)));
  const slower = best(await measureBenchRuns(3, `?burn=${burnMs}`));
  const rows = compare(clean, slower);
  console.log(
    `[bench] android: ${burnMs} ms of work added to every frame\n${formatComparison(rows)}`,
  );
  expect(rows.filter((row) => row.regressed).map((row) => row.metric)).toContain('stepRelative');
  expect(compare(clean, clean).some((row) => row.regressed)).toBe(false);
});

// NF-02 ------------------------------------------------------------------------------------------

type Launch = {
  coldStartMs: number;
  navigationMs: number;
  pageMs: number;
  activityMs: number;
  webview: string;
};

/** One cold launch with fresh app data, timed to the `blacklight:interactive` mark. */
async function launch(app: App): Promise<Launch> {
  const { id } = APPS[app];
  await stop(id, true);
  const { launchedMs, activityMs } = start(id);
  // Attach only after the limit: a start under it is never slowed by the DevTools connection.
  await wait(Math.max(0, launchedMs + START_LIMIT_MS - Date.now()));
  const page = await attach(id);
  await page.waitForFunction((mark) => performance.getEntriesByName(mark).length > 0, MARK, {
    timeout: 30_000,
  });
  const { origin, mark } = await page.evaluate((name) => {
    return {
      origin: performance.timeOrigin,
      mark: performance.getEntriesByName(name)[0]!.startTime,
    };
  }, MARK);
  const coldStartMs = origin + mark - launchedMs;
  if (!(origin > launchedMs && coldStartMs < 60_000))
    throw new Error(
      `The page's time origin (${origin}) does not follow the launch (${launchedMs}): device clock changed?`,
    );
  return {
    coldStartMs: round(coldStartMs),
    navigationMs: round(origin - launchedMs),
    pageMs: round(mark),
    activityMs,
    webview,
  };
}

async function launches(app: App, count: number): Promise<Launch[]> {
  const results: Launch[] = [];
  let lost = 0;
  while (results.length < count) {
    try {
      results.push(await launch(app));
    } catch (error) {
      // A launch Playwright could not attach to is not a measurement: launch again, twice at most.
      if (!/no DevTools connection/.test((error as Error).message) || ++lost > 2) throw error;
      console.log(`[bench] ${(error as Error).message}; launching again`);
    }
  }
  return results;
}

for (const app of ['party-game', 'visual-novel'] as const) {
  test(`NF-02: ${app} release app is interactive within 5 s of launch, within 10 % of the baseline`, async (// eslint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    test.setTimeout(300_000 + 2 * (LAUNCHES + 1) * 30_000);
    buildAndInstall(app);
    // Unmeasured: the device's file cache then holds the APK for every measured launch.
    await launches(app, 1);
    const { rows, runs } = await recordRuns({
      profile: `android-cold-start-${app}`,
      gpu,
      runs: await launches(app, LAUNCHES),
      more: () => launches(app, LAUNCHES),
      testInfo,
    });
    const times = runs.map((r) => r.coldStartMs as number);
    const typical = round(median(times));
    console.log(
      `[bench] android-cold-start-${app}: median ${typical} ms (${Math.min(...times)} to ${Math.max(...times)}) over ${runs.length} launches`,
    );
    expect
      .soft(typical, `median start of ${app} (NF-02: under ${START_LIMIT_MS} ms)`)
      .toBeLessThan(START_LIMIT_MS);
    expect(
      rows.filter((row) => row.regressed).map((row) => row.metric),
      formatComparison(rows),
    ).toEqual([]);
  });
}

// Proof, as in e2e/cold-start.spec.ts: the fixture built a second time with busy work before its
// first frame worth 30 % of its median start (VITE_BENCH_STARTUP_DELAY_MS, read by the fixture
// only) must be reported as a regression against the clean build; clean against itself must not.
test('NF-02: the regression check fails when startup takes 30 % longer', async () => {
  test.setTimeout(900_000);
  buildAndInstall('bench');
  await launches('bench', 1);
  const clean = {
    coldStartMs: median((await launches('bench', LAUNCHES)).map((r) => r.coldStartMs)),
  };
  const delayMs = Math.round(clean.coldStartMs * 0.3);
  buildAndInstall('bench', { VITE_BENCH_STARTUP_DELAY_MS: String(delayMs) });
  await launches('bench', 1);
  const slower = {
    coldStartMs: median((await launches('bench', LAUNCHES)).map((r) => r.coldStartMs)),
  };
  const rows = compare(clean, slower);
  console.log(`[bench] android: ${delayMs} ms of startup work added\n${formatComparison(rows)}`);
  expect(rows.filter((row) => row.regressed).map((row) => row.metric)).toEqual(['coldStartMs']);
  expect(compare(clean, clean).some((row) => row.regressed)).toBe(false);
});

// NF-03 ------------------------------------------------------------------------------------------

/** Standard gamepad buttons. */
const A = 0;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;
const PADS = 4;

/** Replaces the Gamepad API with `count` standard pads whose buttons the spec sets. */
function fakeGamepads(count: number) {
  const state = Array.from({ length: count }, () => new Array(17).fill(0));
  Object.assign(window, { __pads: state });
  navigator.getGamepads = () =>
    state.map(
      (buttons, index) =>
        ({
          index,
          id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
          connected: true,
          mapping: 'standard',
          axes: [0, 0, 0, 0],
          buttons: buttons.map((value: number) => ({
            value,
            pressed: value > 0.5,
            touched: value > 0,
          })),
          timestamp: performance.now(),
          vibrationActuator: null,
        }) as unknown as Gamepad,
    );
}

async function setButton(page: Page, pad: number, button: number, value: number) {
  await page.evaluate(
    ([p, b, v]) => ((window as unknown as { __pads: number[][] }).__pads[p]![b] = v),
    [pad, button, value] as const,
  );
}

/** The release build has no `window.blacklight`: a press lasts a few frames of real time. */
async function press(page: Page, pad: number, button: number) {
  await setButton(page, pad, button, 1);
  await wait(150);
  await setButton(page, pad, button, 0);
  await wait(250);
}

/** One party session: title, then four players in Survival VS; memory sampled all along. */
async function session(): Promise<Record<string, number | string>> {
  const { id } = APPS['party-game'];
  await stop(id, true);
  start(id);
  // Title screen, before any DevTools connection: the app as a player opens it.
  await wait(8000);
  const title = memory(id);
  const page = await attach(id);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(fakeGamepads, PADS);
  await page.reload();
  const game = page.locator('#game');
  await expect(game).toHaveAttribute('data-blacklight-scene', 'title', { timeout: 30_000 });
  await wait(1000);
  await press(page, 0, A);
  await expect(game).toHaveAttribute('data-blacklight-scene', 'player-select');
  await wait(500);
  for (let pad = 1; pad < PADS; pad++) await press(page, pad, A);
  await expect(page.locator('.slot--joined')).toHaveCount(PADS);
  for (let pad = 0; pad < PADS; pad++) await press(page, pad, A);
  await expect(game).toHaveAttribute('data-blacklight-scene', 'game-select', { timeout: 10_000 });
  // Survival VS (first card), default settings, PLAY!
  await press(page, 0, A);
  await press(page, 0, DOWN);
  await press(page, 0, DOWN);
  await press(page, 0, A);
  await expect(game).toHaveAttribute('data-blacklight-scene', 'match', { timeout: 10_000 });
  const samples: number[] = [];
  let apps = 0;
  let renderers = 0;
  // About 30 s of the match, players running left and right, one sample every few seconds.
  for (let i = 0; i < 8; i++) {
    for (let pad = 0; pad < PADS; pad++)
      await setButton(page, pad, i % 2 === pad % 2 ? LEFT : RIGHT, 1);
    await wait(2500);
    for (let pad = 0; pad < PADS; pad++) {
      await setButton(page, pad, LEFT, 0);
      await setButton(page, pad, RIGHT, 0);
    }
    const sample = memory(id);
    if (sample.totalMb > Math.max(0, ...samples)) {
      apps = sample.appMb;
      renderers = sample.rendererMb;
    }
    samples.push(sample.totalMb);
  }
  expect(errors).toEqual([]);
  return {
    titlePssMb: title.totalMb,
    titleAppPssMb: title.appMb,
    titleRendererPssMb: title.rendererMb,
    peakPssMb: Math.max(...samples),
    peakAppPssMb: apps,
    peakRendererPssMb: renderers,
    matchMedianPssMb: median(samples),
    webview,
  };
}

test('NF-03: party-game stays under 300 MB through a four-player match, within 10 % of the baseline', async (// eslint-disable-next-line no-empty-pattern
{}, testInfo) => {
  test.setTimeout(300_000 + 2 * SESSIONS * 120_000);
  if (!installed.has('party-game')) buildAndInstall('party-game');
  const sessions = async (count: number) => {
    const results: Record<string, number | string>[] = [];
    for (let i = 0; i < count; i++) results.push(await session());
    return results;
  };
  const { rows, runs } = await recordRuns({
    profile: 'android-memory-party-game',
    gpu,
    runs: await sessions(SESSIONS),
    more: () => sessions(SESSIONS),
    testInfo,
  });
  const peak = Math.max(...runs.map((r) => r.peakPssMb as number));
  console.log(
    `[bench] android-memory-party-game: title ${summarize(runs).titlePssMb} MB, peak ${peak} MB over ${runs.length} sessions`,
  );
  expect
    .soft(peak, `peak PSS of party-game (NF-03: under ${MEMORY_LIMIT_MB} MB)`)
    .toBeLessThan(MEMORY_LIMIT_MB);
  expect(
    rows.filter((row) => row.regressed).map((row) => row.metric),
    formatComparison(rows),
  ).toEqual([]);
});

declare global {
  interface Window {
    blacklightBench?: unknown;
  }
}
