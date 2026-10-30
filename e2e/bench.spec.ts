// NF-01 benchmark (SPEC §11.1: "benchmark scene reports fps/memory; CI fails on regression > 10 %").
// Runs the release build of e2e/fixtures/bench (300 animated sprites under an animated Vue screen)
// at 1920×1080 and at a phone viewport, writes bench-results/<profile>.json and compares the
// medians with the baseline of this runner in e2e/bench-baseline.json.
//
// Method, chosen for stable numbers on a headless browser:
// - Run alone: this file is its own Playwright project (`pnpm bench`), outside `pnpm e2e`, so no
//   other spec builds or renders on the machine while it measures.
// - No CPU throttling, background timer throttling off, a fresh browser context per run.
// - Each run warms up for 2 s (shader compilation, texture uploads, JIT), then the scene measures
//   a fixed 5 s window itself (e2e/fixtures/bench/scenes/bench/bench.scene.ts).
// - Headless Chromium shows at most 60 frames per second, so on a fast machine fps and 1 % low sit
//   at 60 and only move when a frame misses its slot. The metrics that see a 10 % change before
//   it costs frames are the work per frame: `frameWorkMs` (main-thread time of the rendering task,
//   measured by the page), `mainThreadMs` (all main-thread tasks over the window, from the
//   DevTools protocol, divided by the frames shown) and `gameMs` (the engine's own ticker work).
// - Five runs per viewport; each metric is the median of the runs, so one run disturbed by the OS
//   does not move the result. Frame interval percentiles and p99 frame work are recorded but not
//   gated: a single late frame changes them by more than 10 %.
// - The JS heap is read after a forced garbage collection (`--expose-gc`) with precise memory info,
//   so it is the memory the scene keeps, not the garbage of the last frames.
// - Baselines are per runner (`BLACKLIGHT_BENCH_RUNNER`, default: OS, CPU model and GPU), because
//   absolute timings only compare on the same hardware. Without a baseline for this runner the
//   test records the results and passes. `BLACKLIGHT_BENCH_UPDATE=1 pnpm bench` stores the
//   results as the baseline; `node scripts/bench.mjs update <files>` does the same with result
//   files downloaded from CI.
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type TestInfo,
} from '@playwright/test';
import {
  compare,
  formatComparison,
  readBaseline,
  summarize,
  updateBaseline,
} from '../scripts/bench.mjs';
import { run, serve } from './server';

const fixture = resolve(import.meta.dirname, 'fixtures/bench');
const resultsDir = resolve(import.meta.dirname, '../bench-results');
const port = 5440;
const RUNS = Number(process.env.BLACKLIGHT_BENCH_RUNS ?? 5);

const PROFILES: Record<string, BrowserContextOptions> = {
  desktop: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  // Galaxy A54 class, landscape: the viewport and pixel ratio of the reference phone.
  phone: {
    viewport: { width: 915, height: 412 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
};

type Run = Record<string, unknown> & { frames: number };

let browser: Browser;
let stop: (() => void) | undefined;
let gpu = 'unknown';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  run('pnpm', ['build'], fixture);
  stop = await serve(fixture, 'preview', port);
  browser = await chromium.launch({
    args: [
      // A hardware GPU when there is one (SwiftShader otherwise, as on CI runners).
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      ...(process.platform === 'linux' ? ['--use-angle=vulkan'] : []),
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });
});

test.afterAll(async () => {
  await browser?.close();
  stop?.();
});

/** One benchmark run in a fresh context: the scene's own result plus main-thread time from CDP. */
async function measure(profile: BrowserContextOptions, query = ''): Promise<Run> {
  const context = await browser.newContext(profile);
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const taskSeconds = async () =>
      (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration')!
        .value;
    let start = 0;
    let busy = 0;
    await page.exposeFunction('blacklightBenchWindow', async (phase: 'start' | 'end') => {
      if (phase === 'start') start = await taskSeconds();
      else busy = (await taskSeconds()) - start;
    });
    await page.goto(`http://localhost:${port}/${query}`);
    await expect(page.locator('#game')).toHaveAttribute('data-bench', /frames/, {
      timeout: 60_000,
    });
    const result = (await page.evaluate(() => window.blacklightBench)) as unknown as Run;
    if (gpu === 'unknown')
      gpu = await page.evaluate(() => {
        const gl = document.querySelector('#game canvas')!.getContext('webgl2');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
      });
    expect(errors).toEqual([]);
    return { ...result, mainThreadMs: Math.round(((busy * 1000) / result.frames) * 100) / 100 };
  } finally {
    await context.close();
  }
}

async function measureRuns(profile: BrowserContextOptions, runs: number, query = '') {
  const results: Run[] = [];
  for (let i = 0; i < runs; i++) results.push(await measure(profile, query));
  return results;
}

function runnerName(): string {
  if (process.env.BLACKLIGHT_BENCH_RUNNER) return process.env.BLACKLIGHT_BENCH_RUNNER;
  return `${process.platform}-${process.arch} · ${cpus()[0]?.model.trim() ?? 'cpu'} · ${gpu}`;
}

for (const [name, profile] of Object.entries(PROFILES)) {
  test(`${name}: 300 animated sprites and an animated UI screen stay within 10 % of the baseline`, async (// eslint-disable-next-line no-empty-pattern
  {}, testInfo: TestInfo) => {
    test.setTimeout(60_000 + RUNS * 30_000);
    const runs = await measureRuns(profile, RUNS);
    const median = summarize(runs);
    const runner = runnerName();
    const file = {
      runner,
      profile: name,
      gpu,
      date: new Date().toISOString(),
      median,
      runs,
    };
    mkdirSync(resultsDir, { recursive: true });
    const path = join(resultsDir, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    await testInfo.attach(`bench-${name}`, { path, contentType: 'application/json' });

    if (process.env.BLACKLIGHT_BENCH_UPDATE === '1') {
      updateBaseline([file]);
      testInfo.annotations.push({ type: 'baseline', description: `updated for ${runner}` });
      return;
    }
    const baseline = readBaseline()[runner]?.[name];
    if (!baseline) {
      testInfo.annotations.push({
        type: 'baseline',
        description: `no baseline for "${runner}" / ${name}: results in ${path}; store them with BLACKLIGHT_BENCH_UPDATE=1 or node scripts/bench.mjs update`,
      });
      console.log(`[bench] no baseline for "${runner}" / ${name}`);
      return;
    }
    const rows = compare(baseline.median, median);
    console.log(`[bench] ${name} on "${runner}"\n${formatComparison(rows)}`);
    expect(
      rows.filter((row) => row.regressed).map((row) => row.metric),
      formatComparison(rows),
    ).toEqual([]);
  });
}

// Proof that the check fails on a real regression: the same scene with busy work added to every
// frame (`?burn=<ms>`, about a third of the frame work), compared with clean runs taken just
// before on the same machine, must be reported as a regression.
test('the regression check fails when every frame does more work', async () => {
  test.setTimeout(60_000 + 6 * 30_000);
  const profile = PROFILES.desktop!;
  const clean = summarize(await measureRuns(profile, 3));
  const burnMs = Math.max(0.5, Math.round(clean.frameWorkMs! * 0.35 * 10) / 10);
  const slower = summarize(await measureRuns(profile, 3, `?burn=${burnMs}`));
  const rows = compare(clean, slower);
  console.log(`[bench] ${burnMs} ms of work added to every frame\n${formatComparison(rows)}`);
  const regressed = rows.filter((row) => row.regressed).map((row) => row.metric);
  expect(regressed).toContain('gameMs');
  expect(regressed).toContain('mainThreadMs');
  // And the same comparison passes when nothing changed.
  expect(compare(clean, clean).some((row) => row.regressed)).toBe(false);
});

declare global {
  interface Window {
    blacklightBench?: unknown;
  }
}
