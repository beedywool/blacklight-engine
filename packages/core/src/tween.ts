import {
  anticipate,
  backIn,
  backInOut,
  backOut,
  circIn,
  circInOut,
  circOut,
  easeIn,
  easeInOut,
  easeOut,
  spring as motionSpring,
} from 'motion';

export type EaseName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backIn'
  | 'backOut'
  | 'backInOut'
  | 'circIn'
  | 'circOut'
  | 'circInOut'
  | 'anticipate';

/** A Motion spring: physical, its duration follows from the settings. */
export interface SpringOptions {
  type: 'spring';
  stiffness?: number;
  damping?: number;
  mass?: number;
}

export interface TweenOptions {
  /** Duration in ms (ignored by springs). @defaultValue `300` */
  duration?: number;
  delay?: number;
  /** Easing name, function (0–1 → 0–1) or spring. @defaultValue `'easeOut'` */
  ease?: EaseName | ((t: number) => number) | SpringOptions;
  /** Extra runs; `Infinity` loops forever. */
  repeat?: number;
  /** Plays backwards on every other run. */
  yoyo?: boolean;
  onUpdate?: (progress: number) => void;
  onComplete?: () => void;
}

const EASES: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  easeIn,
  easeOut,
  easeInOut,
  backIn,
  backOut,
  backInOut,
  circIn,
  circOut,
  circInOut,
  anticipate,
};

/** Builds an easing function and its natural duration (springs). */
function easing(
  ease: TweenOptions['ease'],
  duration: number,
): { fn: (t: number) => number; duration: number } {
  if (typeof ease === 'function') return { fn: ease, duration };
  if (typeof ease === 'object') {
    const generator = motionSpring({
      keyframes: [0, 1],
      stiffness: ease.stiffness,
      damping: ease.damping,
      mass: ease.mass,
    });
    let total = 0;
    while (total < 10_000 && !generator.next(total).done) total += 1000 / 60;
    const samples: number[] = [];
    for (let t = 0; t <= total; t += 1000 / 120) samples.push(generator.next(t).value as number);
    samples.push(1);
    return {
      fn: (t) => {
        const f = t * (samples.length - 1);
        const i = Math.floor(f);
        const a = samples[i] ?? 1;
        const b = samples[i + 1] ?? 1;
        return a + (b - a) * (f - i);
      },
      duration: Math.max(total, 1),
    };
  }
  return { fn: EASES[ease ?? 'easeOut'], duration };
}

interface Track {
  target: Record<string, unknown>;
  key: string;
  from: number;
  to: number;
}

function resolveTrack(root: object, path: string, to: number): Track {
  const parts = path.split('.');
  let target = root as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = target[part];
    if (typeof next !== 'object' || next === null)
      throw new Error(`Cannot tween "${path}": "${part}" is not an object.`);
    target = next as Record<string, unknown>;
  }
  const key = parts[parts.length - 1]!;
  const from = target[key];
  if (typeof from !== 'number') throw new Error(`Cannot tween "${path}": it is not a number.`);
  return { target, key, from, to };
}

/** A running tween. */
export class Tween {
  /** Resolves when the tween completes (not when it is stopped). */
  readonly finished: Promise<void>;
  paused = false;
  private elapsed = 0;
  private run = 0;
  private tracks: Track[] | undefined;
  private resolve!: () => void;
  private readonly fn: (t: number) => number;
  private readonly duration: number;
  done = false;

  constructor(
    readonly target: object,
    private readonly to: Record<string, number>,
    private readonly options: TweenOptions,
  ) {
    const e = easing(options.ease, options.duration ?? 300);
    this.fn = e.fn;
    this.duration = e.duration;
    this.finished = new Promise((resolve) => (this.resolve = resolve));
  }

  /** 0–1 within the current run. */
  get progress(): number {
    return Math.min(1, Math.max(0, (this.elapsed - (this.options.delay ?? 0)) / this.duration));
  }

  /** Stops where it is; `finished` does not resolve. */
  stop(): void {
    this.done = true;
  }

  /** Jumps to the end and resolves `finished`. */
  complete(): void {
    this.tracks ??= Object.entries(this.to).map(([path, value]) =>
      resolveTrack(this.target, path, value),
    );
    for (const t of this.tracks) t.target[t.key] = t.to;
    this.finish();
  }

  /** @internal Advances by `ms` of game time. */
  step(ms: number): void {
    if (this.done || this.paused) return;
    this.elapsed += ms;
    const delay = this.options.delay ?? 0;
    if (this.elapsed < delay) return;
    // Start values are read when the tween starts, after its delay.
    this.tracks ??= Object.entries(this.to).map(([path, value]) =>
      resolveTrack(this.target, path, value),
    );
    const t = Math.min(1, (this.elapsed - delay) / this.duration);
    const backwards = this.options.yoyo && this.run % 2 === 1;
    const eased = this.fn(backwards ? 1 - t : t);
    for (const track of this.tracks)
      track.target[track.key] = track.from + (track.to - track.from) * eased;
    this.options.onUpdate?.(t);
    if (t < 1) return;
    if (this.run < (this.options.repeat ?? 0)) {
      this.run++;
      this.elapsed = delay;
      return;
    }
    this.finish();
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.options.onComplete?.();
    this.resolve();
  }
}

/**
 * Tweens driven by the game clock: they pause with the game, follow its time scale and replay
 * identically. Easings and springs come from Motion.
 *
 * @example
 * ```ts
 * await this.tween(title, { y: 200, alpha: 1 }, { duration: 600, ease: 'backOut' }).finished;
 * this.tween(button, { 'scale.x': 1.1, 'scale.y': 1.1 }, { ease: { type: 'spring', stiffness: 300 } });
 * ```
 */
export class Tweens {
  private list: Tween[] = [];

  add(target: object, to: Record<string, number>, options: TweenOptions = {}): Tween {
    const tween = new Tween(target, to, options);
    this.list.push(tween);
    return tween;
  }

  /** Stops every tween of `target`. */
  stopTweensOf(target: object): void {
    for (const tween of this.list) if (tween.target === target) tween.stop();
  }

  step(ms: number): void {
    for (const tween of [...this.list]) tween.step(ms);
    this.list = this.list.filter((t) => !t.done);
  }

  clear(): void {
    for (const tween of this.list) tween.stop();
    this.list = [];
  }

  get size(): number {
    return this.list.length;
  }
}
