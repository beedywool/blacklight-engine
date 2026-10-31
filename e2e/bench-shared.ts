// Shared by the benchmark specs (`pnpm bench`): the Chromium switches, the runner name that keys
// e2e/bench-baseline.json, and the step that writes a result file and compares it with the baseline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import type { TestInfo } from '@playwright/test';
import {
  best,
  compare,
  formatComparison,
  gatedValues,
  readBaseline,
  summarize,
  updateBaseline,
} from '../scripts/bench.mjs';

export const resultsDir = resolve(import.meta.dirname, '../bench-results');
export const RUNS = Number(process.env.BLACKLIGHT_BENCH_RUNS ?? 5);

/** Chromium as a player's browser runs it: a hardware GPU when there is one, no background throttling. */
export const CHROMIUM_ARGS = [
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
];

/** WebGL renderer string of a page, part of the default runner name. */
export function rendererScript(canvas: HTMLCanvasElement): string {
  const gl = canvas.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}

/** Baseline key: `BLACKLIGHT_BENCH_RUNNER` (CI), or OS, CPU model and GPU renderer. */
export function runnerName(gpu: string): string {
  if (process.env.BLACKLIGHT_BENCH_RUNNER) return process.env.BLACKLIGHT_BENCH_RUNNER;
  return `${process.platform}-${process.arch} · ${cpus()[0]?.model.trim() ?? 'cpu'} · ${gpu}`;
}

type Run = Record<string, unknown>;

/**
 * Compares a set of runs with this runner's baseline for `profile`, measures a second set
 * (`more`) when a gated metric regressed, writes `bench-results/<profile>.json` and attaches it.
 * With `BLACKLIGHT_BENCH_UPDATE=1` the results become the baseline. Returns the comparison rows
 * (empty without a baseline or when updating) and every run measured.
 */
export async function recordRuns(options: {
  profile: string;
  gpu: string;
  runs: Run[];
  more: () => Promise<Run[]>;
  testInfo: TestInfo;
}): Promise<{ rows: ReturnType<typeof compare>; runs: Run[] }> {
  const { profile, gpu, testInfo } = options;
  const runs = [...options.runs];
  const runner = runnerName(gpu);
  const update = process.env.BLACKLIGHT_BENCH_UPDATE === '1';
  const baseline = readBaseline()[runner]?.[profile];
  const current = () => gatedValues({ best: best(runs), median: summarize(runs) });
  let rows = baseline ? compare(gatedValues(baseline), current()) : [];
  if (rows.some((row) => row.regressed) && !update) {
    // A second set before failing: the machine may have been busy during the whole first set.
    console.log(`[bench] ${profile}: regression in the first ${runs.length} runs, measuring more`);
    runs.push(...(await options.more()));
    rows = compare(gatedValues(baseline!), current());
  }
  const file = {
    runner,
    profile,
    gpu,
    date: new Date().toISOString(),
    best: best(runs),
    median: summarize(runs),
    runs,
  };
  mkdirSync(resultsDir, { recursive: true });
  const path = join(resultsDir, `${profile}.json`);
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
  await testInfo.attach(`bench-${profile}`, { path, contentType: 'application/json' });

  if (update) {
    updateBaseline([file]);
    testInfo.annotations.push({ type: 'baseline', description: `updated for ${runner}` });
    return { rows: [], runs };
  }
  if (!baseline) {
    testInfo.annotations.push({
      type: 'baseline',
      description: `no baseline for "${runner}" / ${profile}: results in ${path}; store them with BLACKLIGHT_BENCH_UPDATE=1 or node scripts/bench.mjs update`,
    });
    console.log(`[bench] no baseline for "${runner}" / ${profile}`);
    return { rows: [], runs };
  }
  console.log(`[bench] ${profile} on "${runner}" (${runs.length} runs)\n${formatComparison(rows)}`);
  return { rows, runs };
}
