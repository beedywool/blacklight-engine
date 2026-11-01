// NF-02 benchmark: "cold start under 3 s on desktop". Part of `pnpm bench` (the `bench` project,
// one worker), next to the NF-01 benchmark, and compared the same way: per-runner baseline in
// e2e/bench-baseline.json, 10 % tolerance (scripts/bench.mjs).
//
// Definition: from the moment the game is launched to the first frame of its entry scene, drawn
// with the game taking input. The engine marks that moment with the user timing mark
// `blacklight:interactive` (packages/core/src/game.ts): set after `data-blacklight-state` turns
// `running` (scene created, input attached), in the first frame after it, once Pixi has rendered.
// That is what a player sees as "the game is up": the title screen, ready for a key.
//
// - Desktop: the packaged release app of the host OS (`blacklight build --target <os> --dir`),
//   started from its executable, a fresh process with a fresh profile (an empty temporary data
//   and config folder per launch: no V8 code cache, no GPU shader cache, no settings). A packaged
//   release app has its fuses set and refuses debugging switches, so Playwright cannot attach to
//   it; Chromium's startup tracing (`--trace-startup`, not a debugging switch) records the mark
//   instead. The time is the mark's trace timestamp minus the moment just before `spawn`, both
//   read from the OS monotonic clock (CLOCK_MONOTONIC on Linux, mach_absolute_time on macOS,
//   QueryPerformanceCounter on Windows, which Node and Chromium both use).
// - Web: the release web build served on localhost, in a newly launched Chromium with a fresh
//   profile per run (no HTTP cache, no service worker, no code cache); the time is the mark's
//   `startTime`, measured from the start of the navigation. Network time is out of it (localhost).
// - OS file cache: it cannot be emptied without root (Linux drop_caches, macOS purge), so every
//   launch reads files the OS has cached. One unmeasured launch per app comes first, so all
//   measured launches see the same warm cache; the first launch after a reboot is slower and is
//   a manual check (MANUAL_TESTS.md).
// - Gate: nine launches; their median must stay under 3 s (the spec's limit, for a typical
//   launch) and within 10 % of the runner's baseline, with nine more launches before failing.
//   The median, not the best launch as in NF-01: on this desktop about one launch in five is
//   20 % faster than the others, in both the process start and the page (cause not found; the
//   CPU runs the performance governor without boost), so the best launch depends on whether a
//   fast one happened. Five launches were not enough either: one session had three fast ones.
//   A change under two display frames (33 ms) never counts, since the mark lands on a frame;
//   that floor matters only for the web start (about 90 ms here).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect, test, type TestInfo } from '@playwright/test';
import { compare, formatComparison, median } from '../scripts/bench.mjs';
import { CHROMIUM_ARGS, recordRuns, rendererScript } from './bench-shared';
import { run, serve } from './server';

/** NF-02: cold start under 3 s on desktop. */
const LIMIT_MS = 3000;
/** Startup trace length: the app must be interactive within it (twice the limit). */
const TRACE_SECONDS = 6;
/** Launches per app and per set; nine keep the median out of the fast mode (see above). */
const LAUNCHES = Number(process.env.BLACKLIGHT_BENCH_LAUNCHES ?? 9);
const TEMPLATES = ['party-game', 'visual-novel'] as const;
const root = resolve(import.meta.dirname, '..');
const os = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
// Never wait on the OS keystore: a prompt would hang the test and CI has nobody to answer it.
// Linux: the desktop's keyring (CI has none); macOS: the login Keychain, which a headless runner
// leaves the save key's first read waiting on (the real Keychain is in MANUAL_TESTS.md).
const KEYRING =
  os === 'linux' ? ['--password-store=basic'] : os === 'mac' ? ['--use-mock-keychain'] : [];
const MARK = 'blacklight:interactive';

type Launch = { coldStartMs: number; navigationMs: number; pageMs: number };
type PageLoad = { coldStartMs: number; runningMs: number; domContentLoadedMs: number };

let gpu = 'unknown';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // The GPU names the runner, as in e2e/bench.spec.ts, so both specs share one baseline entry.
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage();
  await page.setContent('<canvas></canvas>');
  gpu = await page.locator('canvas').evaluate(rendererScript);
  await browser.close();
});

/** Unpacked packaged app of the host OS, as players get it minus the installer. */
function buildDesktop(game: string, env: Record<string, string> = {}): void {
  const arch = os === 'mac' ? ['--arch', process.arch] : [];
  run('pnpm', ['exec', 'blacklight', 'build', '--target', os, '--dir', ...arch], game, env);
}

/** Path of the packaged executable electron-builder wrote (as in e2e/desktop.spec.ts). */
function packagedExecutable(game: string): string {
  const out = join(game, 'release', os);
  const name = JSON.parse(readFileSync(join(out, 'app', 'package.json'), 'utf8')) as {
    name: string;
    productName: string;
  };
  if (os === 'linux') return join(out, 'linux-unpacked', name.name);
  if (os === 'win') return join(out, 'win-unpacked', `${name.productName}.exe`);
  const dir = join(out, process.arch === 'x64' ? 'mac' : `mac-${process.arch}`);
  return join(dir, `${name.productName}.app`, 'Contents', 'MacOS', name.productName);
}

/** Environment whose data and config folders are a new, empty temporary folder. */
function freshProfile(dir: string): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  if (os === 'linux') {
    env.XDG_DATA_HOME = join(dir, 'data');
    env.XDG_CONFIG_HOME = join(dir, 'config');
    env.XDG_CACHE_HOME = join(dir, 'cache');
  } else if (os === 'win') {
    env.APPDATA = join(dir, 'data');
    env.LOCALAPPDATA = join(dir, 'local');
  } else {
    env.HOME = dir;
  }
  return env;
}

type TraceEvent = { name: string; ts: number; args?: { data?: { startTime?: number } } };

/** One launch of the packaged app with a fresh profile, timed by Chromium's startup trace. */
async function launchDesktop(executable: string): Promise<Launch> {
  const dir = mkdtempSync(join(tmpdir(), 'blacklight-cold-start-'));
  const trace = join(dir, 'trace.json');
  let output = '';
  let exited: number | null | undefined;
  const started = process.hrtime.bigint();
  const child = spawn(
    executable,
    [
      ...KEYRING,
      `--trace-startup=blink.user_timing`,
      '--trace-startup-format=json',
      `--trace-startup-file=${trace}`,
      `--trace-startup-duration=${TRACE_SECONDS}`,
    ],
    { env: freshProfile(dir) },
  );
  child.stdout.on('data', (d: Buffer) => (output += d.toString()));
  child.stderr.on('data', (d: Buffer) => (output += d.toString()));
  child.on('exit', (code) => (exited = code));
  try {
    let events: TraceEvent[] | undefined;
    const deadline = Date.now() + (TRACE_SECONDS + 30) * 1000;
    while (!events) {
      if (exited !== undefined) throw new Error(`${executable} exited with ${exited}:\n${output}`);
      if (Date.now() > deadline) throw new Error(`no startup trace from ${executable}:\n${output}`);
      await new Promise((wait) => setTimeout(wait, 200));
      // The file appears when the trace ends and is complete once it parses.
      if (existsSync(trace)) {
        try {
          events = (JSON.parse(readFileSync(trace, 'utf8')) as { traceEvents: TraceEvent[] })
            .traceEvents;
        } catch {
          // still being written
        }
      }
    }
    const mark = events.find((event) => event.name === MARK);
    if (!mark) {
      throw new Error(
        `${executable} did not reach its first interactive frame (no "${MARK}" mark) within ${TRACE_SECONDS} s.`,
      );
    }
    // Trace timestamps are microseconds of the same monotonic clock as process.hrtime.
    const coldStartMs = (mark.ts - Number(started / 1000n)) / 1000;
    if (!(coldStartMs > 0 && coldStartMs < TRACE_SECONDS * 1000)) {
      throw new Error(
        `Cold start of ${coldStartMs} ms: the trace clock does not match Node's monotonic clock on this OS.`,
      );
    }
    const pageMs = mark.args?.data?.startTime ?? Number.NaN;
    return {
      coldStartMs: round(coldStartMs),
      navigationMs: round(coldStartMs - pageMs),
      pageMs: round(pageMs),
    };
  } finally {
    if (exited === undefined) {
      const gone = new Promise((done) => child.once('exit', done));
      child.kill();
      await gone;
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}

const round = (value: number) => Math.round(value * 10) / 10;

/** One page load in a newly launched browser (fresh process and profile). */
async function loadWeb(url: string): Promise<PageLoad> {
  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // When `data-blacklight-state` turns `running`: the entry scene is created, before its first frame.
    await page.addInitScript(() => {
      new MutationObserver((records, observer) => {
        const mount = records[0]!.target as HTMLElement;
        if (mount.dataset.blacklightState !== 'running') return;
        (window as { blacklightRunningMs?: number }).blacklightRunningMs = performance.now();
        observer.disconnect();
      }).observe(document, { subtree: true, attributeFilter: ['data-blacklight-state'] });
    });
    // Requests still open when a load misses the limit: tells a stalled server or file from a
    // busy page (one load in nine missed 6 s on a slow Windows runner, without a trace).
    const pending = new Map<object, string>();
    page.on('request', (request) => pending.set(request, request.url()));
    page.on('requestfinished', (request) => pending.delete(request));
    page.on('requestfailed', (request) => pending.delete(request));
    const started = Date.now();
    await page.goto(url, { waitUntil: 'commit' });
    try {
      await page.waitForFunction((mark) => performance.getEntriesByName(mark).length > 0, MARK, {
        timeout: TRACE_SECONDS * 1000,
      });
    } catch (error) {
      const state = await Promise.race([
        page
          .evaluate(() => document.querySelector('#game')?.getAttribute('data-blacklight-state'))
          .catch(() => 'unknown'),
        new Promise<string>((done) => setTimeout(() => done('page not answering'), 5000)),
      ]);
      throw new Error(
        `${(error as Error).message}\nAfter ${Date.now() - started} ms: state ${state}, errors ${JSON.stringify(errors)}, requests still open: ${[...pending.values()].join(', ') || 'none'}`,
        { cause: error },
      );
    }
    const load = await page.evaluate((mark) => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        coldStartMs: performance.getEntriesByName(mark)[0]!.startTime,
        runningMs: (window as { blacklightRunningMs?: number }).blacklightRunningMs ?? Number.NaN,
        domContentLoadedMs: nav.domContentLoadedEventEnd,
      };
    }, MARK);
    expect(errors).toEqual([]);
    return {
      coldStartMs: round(load.coldStartMs),
      runningMs: round(load.runningMs),
      domContentLoadedMs: round(load.domContentLoadedMs),
    };
  } finally {
    await browser.close();
  }
}

async function repeat<T>(times: number, once: () => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < times; i++) results.push(await once());
  return results;
}

/** Absolute check and regression check, both on the median launch. */
async function gate(
  profile: string,
  launch: () => Promise<Record<string, number>>,
  testInfo: TestInfo,
) {
  // Unmeasured: the OS file cache then holds the app's files for every measured launch. It may
  // be slow (files just written by the build), so it is allowed to miss the trace.
  await launch().catch((error: Error) =>
    console.log(`[bench] ${profile} warm-up: ${error.message}`),
  );
  const { rows, runs } = await recordRuns({
    profile,
    gpu,
    runs: await repeat(LAUNCHES, launch),
    more: () => repeat(LAUNCHES, launch),
    testInfo,
  });
  const times = runs.map((r) => r.coldStartMs as number);
  const typical = median(times);
  console.log(
    `[bench] ${profile}: median ${typical} ms (${Math.min(...times)} to ${Math.max(...times)}) over ${runs.length} launches`,
  );
  expect
    .soft(typical, `median cold start of ${profile} (NF-02: under ${LIMIT_MS} ms)`)
    .toBeLessThan(LIMIT_MS);
  expect(
    rows.filter((row) => row.regressed).map((row) => row.metric),
    formatComparison(rows),
  ).toEqual([]);
}

for (const [index, template] of TEMPLATES.entries()) {
  const game = join(root, 'templates', template);

  test(`${template}: web release build is interactive within 3 s of navigation, within 10 % of the baseline`, async (// eslint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    test.setTimeout(180_000 + 2 * LAUNCHES * 15_000);
    run('pnpm', ['build'], game);
    const port = 5441 + index;
    const stop = await serve(game, 'preview', port);
    try {
      await gate(
        `cold-start-web-${template}`,
        () => loadWeb(`http://localhost:${port}/`),
        testInfo,
      );
    } finally {
      stop();
    }
  });

  test(`${template}: packaged desktop app is interactive within 3 s of launch, within 10 % of the baseline`, async (// eslint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    test.setTimeout(300_000 + 2 * LAUNCHES * (TRACE_SECONDS + 10) * 1000);
    try {
      buildDesktop(game);
      const executable = packagedExecutable(game);
      await gate(`cold-start-desktop-${template}`, () => launchDesktop(executable), testInfo);
    } finally {
      // Packaged apps are large.
      rmSync(join(game, 'release'), { recursive: true, force: true });
    }
  });
}

// Proof that the check fails on a real regression: the benchmark fixture's packaged app with
// busy work before its first frame (30 % of its own cold start, baked in at build time through
// VITE_BENCH_STARTUP_DELAY_MS, which only the fixture reads), compared with clean launches taken
// just before on the same machine, must be reported as a regression; the clean launches compared
// with themselves must not.
test('the regression check fails when startup takes 30 % longer', async () => {
  test.setTimeout(600_000);
  const fixture = join(root, 'e2e/fixtures/bench');
  try {
    buildDesktop(fixture);
    const executable = packagedExecutable(fixture);
    await launchDesktop(executable);
    const clean = {
      coldStartMs: median(
        (await repeat(LAUNCHES, () => launchDesktop(executable))).map((r) => r.coldStartMs),
      ),
    };
    const delayMs = Math.round(clean.coldStartMs * 0.3);
    buildDesktop(fixture, { VITE_BENCH_STARTUP_DELAY_MS: String(delayMs) });
    await launchDesktop(executable);
    const slower = {
      coldStartMs: median(
        (await repeat(LAUNCHES, () => launchDesktop(executable))).map((r) => r.coldStartMs),
      ),
    };
    const rows = compare(clean, slower);
    console.log(`[bench] ${delayMs} ms of startup work added\n${formatComparison(rows)}`);
    expect(rows.filter((row) => row.regressed).map((row) => row.metric)).toEqual(['coldStartMs']);
    expect(compare(clean, clean).some((row) => row.regressed)).toBe(false);
  } finally {
    rmSync(join(fixture, 'release'), { recursive: true, force: true });
  }
});
