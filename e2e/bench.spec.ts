// NF-01 benchmark (SPEC §11.1: "benchmark scene reports fps/memory; CI fails on regression > 10 %").
// Runs the release build of e2e/fixtures/bench (300 animated sprites under an animated Vue screen)
// at 1920×1080 and at a phone viewport, writes bench-results/<profile>.json and compares the
// runs with the baseline of this runner in e2e/bench-baseline.json.
//
// Method, chosen so that a desktop in use (browser, chat, desktop shell) does not fail the check
// while a 10 % slower engine does:
// - Run alone: this file is its own Playwright project (`pnpm bench`), outside `pnpm e2e`.
// - No CPU throttling, background timer throttling off, a fresh browser context per run. Pages are
//   cross-origin isolated (headers added below), so performance.now() has 5 µs resolution.
// - Each run warms up for 2 s, then the scene measures a fixed 5 s of displayed frames (fps, 1 %
//   low, frame work, game work, main-thread busy time) and the JS heap after a forced GC.
// - Displayed frames are capped at 60 fps and take about 1.2 ms of a 16.7 ms frame here. Between
//   frames the core idles, and its speed when the next frame starts depends on the rest of the
//   machine: the same build measured 1.1 to 1.5 ms from one run to the next, so these timings are
//   recorded but not gated.
// - The gated timing is `stepRelative`. After the window the scene runs bursts of frames back to
//   back (game step, draw, Pixi render, UI timeline and style), each between two runs of a fixed
//   calibration loop, and keeps the median of burst time / calibration time. The CPU speed of
//   the moment changes both by up to 1.5×; the ratio stayed within 3 % across runs, while work
//   added to every frame raises it in proportion (`?burn=<ms>`, the last test below).
// - Five runs per viewport; each gated metric keeps its best run (lowest time, highest frame
//   rate, smallest heap), since other programs only ever slow a run down. When a metric still
//   regresses, five more runs are measured and the best of all ten decides.
// - fps and 1 % low are compared only when the baseline kept up with the display (55 fps or
//   more); without a GPU they measure the software renderer (scripts/bench.mjs).
// - Baselines are per runner (`BLACKLIGHT_BENCH_RUNNER`, default: OS, CPU model and GPU), because
//   absolute numbers only compare on the same hardware. Without a baseline for this runner the
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
  best,
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
      '--enable-blink-features=ForceEagerMeasureMemory',
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
    // Cross-origin isolation: performance.now() gets 5 µs resolution instead of 100 µs (a median of
    // 1 ms frames would move by 10 % steps otherwise), and measureUserAgentSpecificMemory() works.
    await context.route('**/*', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'cross-origin-opener-policy': 'same-origin',
          'cross-origin-embedder-policy': 'require-corp',
        },
      });
    });
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
    test.setTimeout(60_000 + 2 * RUNS * 30_000);
    const runner = runnerName();
    const runs = await measureRuns(profile, RUNS);
    const baseline = readBaseline()[runner]?.[name];
    let rows = baseline ? compare(baseline.best, best(runs)) : [];
    if (rows.some((row) => row.regressed) && process.env.BLACKLIGHT_BENCH_UPDATE !== '1') {
      // A second set before failing: the machine may have been busy during the whole first set.
      console.log(`[bench] ${name}: regression in the first ${RUNS} runs, measuring ${RUNS} more`);
      runs.push(...(await measureRuns(profile, RUNS)));
      rows = compare(baseline!.best, best(runs));
    }
    const file = {
      runner: runnerName(),
      profile: name,
      gpu,
      date: new Date().toISOString(),
      best: best(runs),
      median: summarize(runs),
      runs,
    };
    mkdirSync(resultsDir, { recursive: true });
    const path = join(resultsDir, `${name}.json`);
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    await testInfo.attach(`bench-${name}`, { path, contentType: 'application/json' });

    if (process.env.BLACKLIGHT_BENCH_UPDATE === '1') {
      updateBaseline([file]);
      testInfo.annotations.push({ type: 'baseline', description: `updated for ${file.runner}` });
      return;
    }
    if (!baseline) {
      testInfo.annotations.push({
        type: 'baseline',
        description: `no baseline for "${file.runner}" / ${name}: results in ${path}; store them with BLACKLIGHT_BENCH_UPDATE=1 or node scripts/bench.mjs update`,
      });
      console.log(`[bench] no baseline for "${file.runner}" / ${name}`);
      return;
    }
    console.log(`[bench] ${name} on "${runner}" (${runs.length} runs)\n${formatComparison(rows)}`);
    expect(
      rows.filter((row) => row.regressed).map((row) => row.metric),
      formatComparison(rows),
    ).toEqual([]);
  });
}

// Proof that the check fails on a real regression: the same scene with busy work added to every
// frame (`?burn=<ms>`, a fifth of the frame's own cost), compared with clean runs taken just
// before on the same machine, must be reported as a regression; the clean runs compared with
// themselves must not.
test('the regression check fails when every frame does 20 % more work', async () => {
  test.setTimeout(60_000 + 6 * 30_000);
  const profile = PROFILES.desktop!;
  const cleanRuns = await measureRuns(profile, 3);
  const clean = best(cleanRuns);
  const burnMs = Math.max(0.01, Number((summarize(cleanRuns).stepMs! * 0.2).toFixed(3)));
  const slower = best(await measureRuns(profile, 3, `?burn=${burnMs}`));
  const rows = compare(clean, slower);
  console.log(`[bench] ${burnMs} ms of work added to every frame\n${formatComparison(rows)}`);
  expect(rows.filter((row) => row.regressed).map((row) => row.metric)).toContain('stepRelative');
  expect(compare(clean, clean).some((row) => row.regressed)).toBe(false);
});

declare global {
  interface Window {
    blacklightBench?: unknown;
  }
}
