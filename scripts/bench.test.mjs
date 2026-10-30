// The comparison behind the NF-01 regression check (e2e/bench.spec.ts).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compare, median, summarize, updateBaseline } from './bench.mjs';

const baseline = {
  fps: 60,
  low1Fps: 58,
  frameWorkMs: 2,
  mainThreadMs: 2.2,
  gameMs: 1,
  heapMb: 10,
};
const regressed = (current) =>
  compare(baseline, { ...baseline, ...current })
    .filter((row) => row.regressed)
    .map((row) => row.metric);

describe('benchmark regression check', () => {
  it('takes the median of each metric over the runs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(summarize([{ fps: 59, gpu: 'x' }, { fps: 30 }, { fps: 60 }])).toEqual({ fps: 59 });
  });

  it('passes within 10 % and fails beyond, in the bad direction only', () => {
    expect(regressed({ frameWorkMs: 2.19, fps: 54.1, heapMb: 10.9 })).toEqual([]);
    expect(regressed({ frameWorkMs: 2.21 })).toEqual(['frameWorkMs']);
    expect(regressed({ fps: 53.9, low1Fps: 52 })).toEqual(['fps', 'low1Fps']);
    expect(regressed({ heapMb: 11.1, gameMs: 1.2 })).toEqual(['gameMs', 'heapMb']);
    // Faster or smaller is never a regression.
    expect(regressed({ frameWorkMs: 1, fps: 120, heapMb: 5 })).toEqual([]);
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
    expect(stored['github-ubuntu-latest'].desktop.median.fps).toBe(31);
    expect(stored['github-ubuntu-latest'].phone.median.fps).toBe(28);
  });
});
