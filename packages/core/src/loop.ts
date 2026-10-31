import { TIME_EPSILON_MS } from './time-epsilon';

/**
 * Fixed-step accumulator. The game logic advances in equal steps whatever the display rate, so a
 * game behaves the same at 30, 60 or 144 fps and replays deterministically.
 *
 * @example
 * ```ts
 * const steps = new FixedStep(60);
 * const alpha = steps.advance(elapsedMs, () => scene.update());
 * scene.render(alpha);
 * ```
 */
export class FixedStep {
  /** Duration of one logic step in milliseconds. */
  readonly stepMs: number;
  /** Most steps run in one frame; the rest of a long stall is dropped instead of spiralling. */
  readonly maxSteps: number;
  private accumulator = 0;

  constructor(rate = 60, maxSteps = 5) {
    if (!(rate > 0)) throw new RangeError(`FixedStep rate must be positive, got ${rate}`);
    this.stepMs = 1000 / rate;
    this.maxSteps = Math.max(1, Math.floor(maxSteps));
  }

  /**
   * Adds elapsed real time and runs as many steps as fit.
   *
   * @returns The interpolation factor in [0, 1): how far the display is between the last step and
   * the next one.
   */
  advance(elapsedMs: number, step: () => void): number {
    // Clamping before the loop caps catch-up after a stall (tab in background, breakpoint).
    this.accumulator += Math.min(Math.max(0, elapsedMs), this.stepMs * this.maxSteps);
    // The epsilon absorbs float drift: 144 frames of 1000/144 ms must make exactly 60 steps.
    while (this.accumulator >= this.stepMs - TIME_EPSILON_MS) {
      step();
      this.accumulator = Math.max(0, this.accumulator - this.stepMs);
    }
    return this.accumulator / this.stepMs;
  }

  /** Forgets accumulated time, e.g. when resuming from pause. */
  reset(): void {
    this.accumulator = 0;
  }
}
