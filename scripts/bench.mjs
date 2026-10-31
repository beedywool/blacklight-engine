// Benchmark results (e2e/bench.spec.ts, e2e/cold-start.spec.ts): the best and the median of several runs, comparison with
// the committed baseline (e2e/bench-baseline.json), and the command that copies results into it.
//
//   node scripts/bench.mjs update bench-results/*.json
//
// takes result files (written by `pnpm bench`, or downloaded from the CI artifact
// `bench-results-<os>`) and stores them as the baseline of the runner they came from.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Allowed change before a metric counts as a regression (SPEC §11.1: 10 %). */
export const TOLERANCE = 0.1;

export const BASELINE_FILE = join(import.meta.dirname, '../e2e/bench-baseline.json');

/**
 * Metrics the check compares, and which way is better. The others (frame work and game time of
 * displayed frames, frame interval percentiles, `memoryMb`) are recorded but not gated: on a
 * desktop in use they move by 20 to 30 % with the CPU's speed of the moment; see e2e/bench.spec.ts.
 * @type {Record<string, 'higher' | 'lower'>}
 */
export const GATED = {
  fps: 'higher',
  low1Fps: 'higher',
  stepRelative: 'lower',
  heapMb: 'lower',
  // NF-02 (e2e/cold-start.spec.ts): process launch or page navigation to the entry scene's first frame.
  coldStartMs: 'lower',
};

/**
 * Frame rates count only where the baseline kept up with the display. Below that (no GPU: SwiftShader
 * draws on the CPU, 20 to 30 fps at 1080p) they measure the software renderer, change in steps of
 * whole vsync intervals (20 to 17.1 fps is -14 %) and are recorded without being compared.
 */
export const DISPLAY_BOUND_FPS = 55;
const FRAME_RATES = new Set(['fps', 'low1Fps']);

/**
 * Gated metrics judged on the median run instead of the best one. Cold starts on a desktop come in
 * two modes (about 20 % of launches are 20 % faster, the CPU's state at that moment), so the best
 * of five depends on whether a fast launch happened; the median stays within a few percent.
 */
export const MEDIAN_GATED = new Set(['coldStartMs']);

/**
 * Smallest change that can count as a regression, per metric. The cold-start mark lands on a
 * display frame, so a start time moves in steps of 16.7 ms whatever the engine does: below two
 * frames, 10 % of a web start of about 90 ms is under the measure's resolution.
 * @type {Record<string, number>}
 */
export const MIN_CHANGE = { coldStartMs: 2 * (1000 / 60) };

/**
 * The values the check compares, from a result file or a baseline entry: the best run for most
 * gated metrics, the median for {@link MEDIAN_GATED}.
 * @param {{ best: Record<string, number>, median: Record<string, number> }} entry
 * @returns {Record<string, number>}
 */
export function gatedValues(entry) {
  const values = { ...entry.best };
  for (const metric of MEDIAN_GATED) {
    if (typeof entry.median?.[metric] === 'number') values[metric] = entry.median[metric];
    else delete values[metric];
  }
  return values;
}

/** @param {number[]} values */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Median of every numeric metric over several runs.
 * @param {Record<string, unknown>[]} runs
 * @returns {Record<string, number>}
 */
export function summarize(runs) {
  /** @type {Record<string, number>} */
  const result = {};
  for (const key of Object.keys(runs[0] ?? {})) {
    const values = runs.map((run) => run[key]).filter((value) => typeof value === 'number');
    if (values.length === runs.length) result[key] = Number(median(values).toPrecision(4));
  }
  return result;
}

/**
 * Best value of each gated metric over several runs (lowest time, highest frame rate). Another
 * program can only slow a run down, so the best run is the one closest to the engine's own cost.
 * @param {Record<string, unknown>[]} runs
 * @returns {Record<string, number>}
 */
export function best(runs) {
  /** @type {Record<string, number>} */
  const result = {};
  for (const [key, better] of Object.entries(GATED)) {
    const values = runs.map((run) => run[key]).filter((value) => typeof value === 'number');
    if (values.length === 0) continue;
    result[key] = better === 'lower' ? Math.min(...values) : Math.max(...values);
  }
  return result;
}

/**
 * Compares the gated values of a run set with the baseline's ({@link gatedValues}). A metric
 * regresses when it is worse than the baseline by more than `tolerance` (a share of the baseline
 * value) and by more than its {@link MIN_CHANGE}.
 * @param {Record<string, number>} baseline
 * @param {Record<string, number>} current
 * @param {number} [tolerance]
 */
export function compare(baseline, current, tolerance = TOLERANCE) {
  return Object.entries(GATED)
    .filter(
      ([metric]) => typeof baseline[metric] === 'number' && typeof current[metric] === 'number',
    )
    .filter(([metric]) => !FRAME_RATES.has(metric) || baseline.fps >= DISPLAY_BOUND_FPS)
    .map(([metric, better]) => {
      const before = baseline[metric];
      const after = current[metric];
      const change = before === 0 ? 0 : (after - before) / before;
      const worseBy = better === 'lower' ? after - before : before - after;
      const regressed =
        before !== 0 &&
        worseBy > Math.abs(before) * tolerance &&
        worseBy > (MIN_CHANGE[metric] ?? 0);
      return { metric, baseline: before, current: after, change, regressed };
    });
}

/** One line per metric, for test output. @param {ReturnType<typeof compare>} rows */
export function formatComparison(rows) {
  return rows
    .map(
      (row) =>
        `${row.regressed ? 'REGRESSED' : 'ok       '} ${row.metric.padEnd(13)} ${String(row.baseline).padStart(8)} -> ${String(row.current).padStart(8)} (${row.change >= 0 ? '+' : ''}${(row.change * 100).toFixed(1)} %)`,
    )
    .join('\n');
}

/**
 * @typedef {{ gpu: string, date: string, best: Record<string, number>, median: Record<string, number> }} BaselineEntry
 * @typedef {BaselineEntry & { runner: string, profile: string }} BenchFile
 * @typedef {Record<string, Record<string, BaselineEntry>>} Baseline
 */

/** @returns {Baseline} */
export function readBaseline(file = BASELINE_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Stores result files as the baseline of their runner and profile, keeping the other entries.
 * @param {BenchFile[]} results
 */
export function updateBaseline(results, file = BASELINE_FILE) {
  const baseline = readBaseline(file);
  for (const { runner, profile, gpu, date, best: bestValues, median: values } of results) {
    baseline[runner] ??= {};
    baseline[runner][profile] = { gpu, date, best: bestValues, median: values };
  }
  const sorted = Object.fromEntries(
    Object.keys(baseline)
      .sort()
      .map((key) => [key, baseline[key]]),
  );
  writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`);
  return sorted;
}

if (process.argv[1] === import.meta.filename) {
  const [command, ...files] = process.argv.slice(2);
  if (command !== 'update' || files.length === 0) {
    console.error('Usage: node scripts/bench.mjs update <bench-results/*.json>');
    process.exit(1);
  }
  const results = files.map((path) => JSON.parse(readFileSync(path, 'utf8')));
  updateBaseline(results);
  for (const { runner, profile } of results)
    console.log(`baseline updated: ${runner} / ${profile}`);
}
