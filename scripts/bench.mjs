// Benchmark results (e2e/bench.spec.ts): medians of several runs, comparison with the committed
// baseline (e2e/bench-baseline.json), and the command that copies results into that baseline.
//
//   node scripts/bench.mjs update bench-results/*.json
//
// takes result files (written by `pnpm bench`, or downloaded from the CI artifact
// `bench-results-<os>`) and stores their medians as the baseline of the runner they came from.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Allowed change before a metric counts as a regression (SPEC §11.1: 10 %). */
export const TOLERANCE = 0.1;

export const BASELINE_FILE = join(import.meta.dirname, '../e2e/bench-baseline.json');

/**
 * Metrics the check compares, and which way is better. Metrics left out here (frame interval
 * percentiles, `memoryMb`) are recorded in the results but not gated; see e2e/bench.spec.ts.
 * @type {Record<string, 'higher' | 'lower'>}
 */
export const GATED = {
  fps: 'higher',
  low1Fps: 'higher',
  frameWorkMs: 'lower',
  mainThreadMs: 'lower',
  gameMs: 'lower',
  heapMb: 'lower',
};

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
    if (values.length === runs.length) result[key] = Math.round(median(values) * 100) / 100;
  }
  return result;
}

/**
 * Compares medians with a baseline. A metric regresses when it is worse than the baseline by more
 * than `tolerance` (a share of the baseline value).
 * @param {Record<string, number>} baseline
 * @param {Record<string, number>} current
 * @param {number} [tolerance]
 */
export function compare(baseline, current, tolerance = TOLERANCE) {
  return Object.entries(GATED)
    .filter(
      ([metric]) => typeof baseline[metric] === 'number' && typeof current[metric] === 'number',
    )
    .map(([metric, better]) => {
      const before = baseline[metric];
      const after = current[metric];
      const change = before === 0 ? 0 : (after - before) / before;
      const regressed = better === 'lower' ? change > tolerance : change < -tolerance;
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
 * @typedef {{ runner: string, profile: string, gpu: string, date: string, median: Record<string, number> }} BenchFile
 * @typedef {Record<string, Record<string, { gpu: string, date: string, median: Record<string, number> }>>} Baseline
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
  for (const { runner, profile, gpu, date, median: values } of results) {
    baseline[runner] ??= {};
    baseline[runner][profile] = { gpu, date, median: values };
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
