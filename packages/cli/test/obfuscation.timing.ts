// SEC-10: obfuscation at the default level costs at most 10 % and changes no result.
//
// This file is its own Vitest project (`cli-timing` in the root vitest.config.ts) with a later
// group order: it runs after every other test file has finished, so no parallel test file shares
// the runner's CPUs while it measures.
import { describe, expect, it } from 'vitest';
import { obfuscate } from '../src/security';

/**
 * The reference benchmark: game logic of the kind scenes run every step (300 objects moving,
 * bouncing, colliding, scoring), plain and obfuscated.
 */
const WORKLOAD = `
  function makeObjects(count) {
    const objects = [];
    for (let i = 0; i < count; i++) {
      objects.push({ id: i, x: (i * 37) % 640, y: (i * 53) % 360, vx: (i % 7) - 3, vy: (i % 5) - 2, hp: 100, score: 0, tag: i % 3 === 0 ? 'enemy' : 'coin' });
    }
    return objects;
  }
  function step(objects) {
    for (const o of objects) {
      o.x += o.vx; o.y += o.vy;
      if (o.x < 0 || o.x > 640) o.vx = -o.vx;
      if (o.y < 0 || o.y > 360) o.vy = -o.vy;
    }
    const cell = new Map();
    for (const o of objects) {
      const key = ((o.x / 32) | 0) + ':' + ((o.y / 32) | 0);
      let list = cell.get(key);
      if (!list) cell.set(key, (list = []));
      list.push(o);
    }
    let hits = 0;
    for (const list of cell.values()) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs(a.x - b.x) < 8 && Math.abs(a.y - b.y) < 8) {
          hits++;
          if (a.tag === 'enemy') b.hp -= 1; else a.score += 10;
        }
      }
    }
    return hits;
  }
  function run(steps) {
    const objects = makeObjects(300);
    let total = 0;
    for (let s = 0; s < steps; s++) total += step(objects);
    return total;
  }
`;

type Run = (steps: number) => number;

/** The workload's `run`, compiled and warmed up (JIT). */
function compile(source: string): Run {
  const run = new Function(`${source}; return run;`)() as Run;
  run(200);
  return run;
}

/**
 * Milliseconds of CPU the calling thread has used. CPU time, not wall time: on a shared CI runner
 * a round's wall time also counts the time the thread waited for a CPU (rounds of the same code
 * ranged from ×0.46 to ×1.87 there), CPU time does not.
 */
const cpuMs = (): number => {
  const { user, system } = process.threadCpuUsage();
  return (user + system) / 1000;
};

/**
 * Smallest step the CPU-time clock moves by, in ms: about 0.001 on Linux and macOS, one
 * 15.6 ms scheduler tick on Windows (GetThreadTimes). Measured by spinning until the clock has
 * moved 8 times.
 */
function clockResolutionMs(): number {
  let last = cpuMs();
  const first = last;
  let steps = 0;
  const deadline = performance.now() + 2000;
  while (steps < 8 && performance.now() < deadline) {
    const now = cpuMs();
    if (now !== last) {
      steps++;
      last = now;
    }
  }
  return steps ? (last - first) / steps : 16;
}

/**
 * `variant` CPU time / `plain` CPU time, each summed over interleaved rounds in which both run
 * back to back (in alternating order), so a slow stretch of the runner falls on both sides alike.
 *
 * A round runs as many steps as it takes to last 100 clock steps: Windows counts thread time in
 * 15.6 ms ticks, and ~15 ms rounds there read as 0, 1 or 2 ticks; with both sides alternating at
 * the tick period the error does not average out (×1.25 summed over 40 rounds, run 41320068995).
 * At 100 ticks per round a tick is at most 1 % of it. The round count follows the round length
 * (40 rounds of ~10 ms on Linux/macOS, 8 rounds of ~1.6 s on Windows).
 *
 * The rounds start after both sides have run for 3 s: V8 optimises hot functions on a background
 * thread, and on a busy runner that thread finishes seconds late, so early rounds would time the
 * variant's unoptimised code (×1.27 for code that costs ×1.02 once optimised, with
 * `--concurrent-recompilation-delay=1500`).
 */
function slowdown(
  plain: Run,
  variant: Run,
): { ratio: number; plainMs: number; ratios: number[]; steps: number; resolutionMs: number } {
  const warmUpEnd = performance.now() + 3000;
  for (let i = 0; i < 10 || performance.now() < warmUpEnd; i++) {
    plain(600);
    variant(600);
  }
  const resolutionMs = clockResolutionMs();
  // Wall time of 600 plain steps (high resolution), only to size the rounds.
  const sizing = performance.now();
  for (let i = 0; i < 5; i++) plain(600);
  const msPer600 = Math.max((performance.now() - sizing) / 5, 0.01);
  const steps = Math.max(600, Math.ceil((600 * 100 * resolutionMs) / msPer600));
  const roundMs = (msPer600 * steps) / 600;
  const ROUNDS = Math.min(40, Math.max(8, Math.floor(12_000 / roundMs)));
  const time = (run: Run) => {
    const start = cpuMs();
    run(steps);
    return cpuMs() - start;
  };
  let plainTotal = 0;
  let variantTotal = 0;
  const ratios: number[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    let plainMs: number;
    let variantMs: number;
    if (i % 2) {
      variantMs = time(variant);
      plainMs = time(plain);
    } else {
      plainMs = time(plain);
      variantMs = time(variant);
    }
    plainTotal += plainMs;
    variantTotal += variantMs;
    ratios.push(variantMs / plainMs);
  }
  return {
    ratio: variantTotal / plainTotal,
    plainMs: plainTotal / ROUNDS,
    ratios,
    steps,
    resolutionMs,
  };
}

describe('obfuscation cost (SEC-10)', () => {
  it(
    'costs at most 10 % at the default level (low), same results',
    { timeout: 180_000 },
    async () => {
      const plain = compile(WORKLOAD);
      const low = compile(await obfuscate(WORKLOAD, 'low'));
      const medium = compile(await obfuscate(WORKLOAD, 'medium'));
      expect(low(600)).toBe(plain(600));
      expect(medium(600)).toBe(plain(600));
      const { ratio, plainMs, ratios, steps, resolutionMs } = slowdown(plain, low);
      expect(
        ratio,
        `${ratios.length} rounds of ${steps} steps (plain ${plainMs.toFixed(1)} ms CPU, clock step ${resolutionMs.toFixed(3)} ms), per-round CPU ratios ${ratios.map((r) => r.toFixed(3)).join(' ')}`,
      ).toBeLessThanOrEqual(1.1);
      console.log(
        `[SEC-10] ${ratios.length} rounds × ${steps} steps, plain ${plainMs.toFixed(1)} ms CPU, clock step ${resolutionMs.toFixed(3)} ms, low ×${ratio.toFixed(3)}, medium ×${slowdown(plain, medium).ratio.toFixed(3)}`,
      );
    },
  );
});
