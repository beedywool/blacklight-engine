// The comparison behind the NF-01, NF-02 and NF-03 regression checks (e2e/bench.spec.ts,
// e2e/cold-start.spec.ts, e2e/bench-android.spec.ts).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { best, compare, gatedValues, median, summarize, updateBaseline } from './bench.mjs';

const baseline = { fps: 60, low1Fps: 58, stepRelative: 0.2, heapMb: 10 };
const regressed = (current) =>
  compare(baseline, { ...baseline, ...current })
    .filter((row) => row.regressed)
    .map((row) => row.metric);

describe('benchmark regression check', () => {
  it('takes the median of each metric and the best of each gated one over the runs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(summarize([{ fps: 59, gpu: 'x' }, { fps: 30 }, { fps: 60 }])).toEqual({ fps: 59 });
    expect(summarize([{ stepRelative: 0.123456 }])).toEqual({ stepRelative: 0.1235 });
    const runs = [
      { fps: 59, low1Fps: 50, stepRelative: 0.21, heapMb: 10.2, gameMs: 3 },
      { fps: 60, low1Fps: 48, stepRelative: 0.25, heapMb: 10.1, gameMs: 1 },
    ];
    expect(best(runs)).toEqual({ fps: 60, low1Fps: 50, stepRelative: 0.21, heapMb: 10.1 });
  });

  it('passes within 10 % and fails beyond, in the bad direction only', () => {
    expect(regressed({ stepRelative: 0.219, fps: 54.1, heapMb: 10.9 })).toEqual([]);
    expect(regressed({ stepRelative: 0.221 })).toEqual(['stepRelative']);
    expect(regressed({ fps: 53.9, low1Fps: 52 })).toEqual(['fps', 'low1Fps']);
    expect(regressed({ heapMb: 11.1 })).toEqual(['heapMb']);
    // Faster or smaller is never a regression.
    expect(regressed({ stepRelative: 0.1, fps: 120, heapMb: 5 })).toEqual([]);
  });

  it('compares frame rates only when the baseline kept up with the display', () => {
    const software = { fps: 26, low1Fps: 20, stepRelative: 0.3, heapMb: 10 };
    const rows = compare(software, { fps: 20, low1Fps: 15, stepRelative: 0.3, heapMb: 10 });
    expect(rows.map((row) => row.metric)).toEqual(['stepRelative', 'heapMb']);
    expect(rows.some((row) => row.regressed)).toBe(false);
  });

  it('gates cold start on the median launch, lower is better', () => {
    const launches = [
      { coldStartMs: 812, navigationMs: 510 },
      { coldStartMs: 600, navigationMs: 400 },
      { coldStartMs: 779, navigationMs: 530 },
    ];
    const entry = { best: best(launches), median: summarize(launches) };
    expect(entry.best).toEqual({ coldStartMs: 600 });
    expect(gatedValues(entry)).toEqual({ coldStartMs: 779 });
    expect(gatedValues({ best: { fps: 60, coldStartMs: 1 }, median: { fps: 59 } })).toEqual({
      fps: 60,
    });
    const rows = (current) => compare({ coldStartMs: 780 }, { coldStartMs: current });
    expect(rows(857).map((row) => row.regressed)).toEqual([false]);
    expect(rows(859).map((row) => row.regressed)).toEqual([true]);
    expect(rows(600).map((row) => row.regressed)).toEqual([false]);
  });

  it('gates peak memory on the median session, lower is better', () => {
    const sessions = [{ peakPssMb: 256 }, { peakPssMb: 245 }, { peakPssMb: 260 }];
    const entry = { best: best(sessions), median: summarize(sessions) };
    expect(gatedValues(entry)).toEqual({ peakPssMb: 256 });
    const rows = (current) => compare({ peakPssMb: 256 }, { peakPssMb: current });
    expect(rows(281).map((row) => row.regressed)).toEqual([false]);
    expect(rows(282).map((row) => row.regressed)).toEqual([true]);
  });

  it('never counts a start time change under two display frames as a regression', () => {
    const regressedAt = (before, after) =>
      compare({ coldStartMs: before }, { coldStartMs: after })[0].regressed;
    // 90 ms web start: +30 % is less than two frames (33.3 ms), +40 % is more.
    expect(regressedAt(90, 117)).toBe(false);
    expect(regressedAt(90, 126)).toBe(true);
    // Other metrics have no floor.
    expect(compare({ heapMb: 1 }, { heapMb: 1.2 })[0].regressed).toBe(true);
  });

  it('ignores metrics the baseline does not have', () => {
    expect(compare({ fps: 60 }, { fps: 60, gameMs: 50 }).map((row) => row.metric)).toEqual(['fps']);
  });

  it('stores results as the baseline of their runner and profile', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'bench-')), 'baseline.json');
    const entry = (runner, profile, fps) => ({
      runner,
      profile,
      gpu: 'SwiftShader',
      date: '2026-10-30T00:00:00.000Z',
      best: { fps },
      median: { fps },
    });
    updateBaseline([entry('github-ubuntu-latest', 'desktop', 30)], file);
    updateBaseline(
      [entry('github-ubuntu-latest', 'phone', 28), entry('local', 'desktop', 60)],
      file,
    );
    updateBaseline([entry('github-ubuntu-latest', 'desktop', 31)], file);
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    expect(Object.keys(stored)).toEqual(['github-ubuntu-latest', 'local']);
    expect(stored['github-ubuntu-latest'].desktop.best.fps).toBe(31);
    expect(stored['github-ubuntu-latest'].phone.median.fps).toBe(28);
  });
});
