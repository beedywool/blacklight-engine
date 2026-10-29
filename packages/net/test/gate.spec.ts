// Phase 3f gate: 4 simulated players, 150 ms latency, 2 % loss, no desync over 10 minutes of
// game time, on the real Push-Push online scene of the e2e fixture.
import { describe, expect, it } from 'vitest';
import { runGate } from '../../../e2e/fixtures/net/scenes/lobby/gate';

describe('phase 3f gate', () => {
  it('4 players, 150 ms, 2 % loss: no desync over 10 minutes', async () => {
    // NET_GATE_FRAMES shortens the run while debugging; the gate is 10 minutes at 60 steps/s.
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
      ?.env;
    const frames = Number(env?.NET_GATE_FRAMES ?? 60 * 60 * 10);
    const started = performance.now();
    const result = await runGate({ players: 4, frames, latency: 150, jitter: 20, loss: 0.02 });
    console.log(
      `gate: ${frames} steps in ${((performance.now() - started) / 1000).toFixed(1)} s`,
      JSON.stringify({
        frames: result.frames,
        agreedChecksums: result.agreedFrames,
        network: result.network,
        rollbacks: result.stats.map((s) => s.rollbacks),
        stalls: result.stats.map((s) => s.stalls),
      }),
    );
    expect(result.desyncs).toEqual([]);
    expect(result.network.lost).toBeGreaterThan(0);
    expect(result.stats.every((s) => s.rollbacks > 0)).toBe(true);
    // Every machine kept up, and the confirmed checksums agree.
    for (const frame of result.frames) expect(frame).toBeGreaterThan(frames * 0.95);
    expect(result.agreedFrames).toBeGreaterThan(Math.min(...result.frames) / 30 - 5);
  });
});
