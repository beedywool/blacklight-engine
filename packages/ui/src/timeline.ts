import { animate } from 'motion';
import type { Game } from '@blacklight/core';
import { prefersReducedMotion } from './a11y';

type Target = Element | Element[] | string | { value: Element | null | undefined };
type Keyframes = Record<string, unknown>;

/** When and how a {@link Timeline} step plays. */
export interface StepOptions {
  /**
   * When the step starts, in seconds: a number (absolute), `'+0.1'` / `'-0.1'` (after / before the
   * end of the previous step), `'<'` (with the previous step), a label, or `'label+0.2'`.
   */
  at?: number | string;
  /** Seconds. @defaultValue `0.3` */
  duration?: number;
  /** Motion easing: name or cubic bezier. */
  ease?: string | [number, number, number, number];
}

interface Segment {
  target: Target;
  keyframes: Keyframes;
  start: number;
  duration: number;
  ease?: StepOptions['ease'];
}

interface Cue {
  time: number;
  run: () => void;
  /** Sound cues are skipped when jumping to the end (reduced motion). */
  sound?: boolean;
}

/** How `stop()` and interruptions leave the animated elements. */
export type StopMode = 'freeze' | 'finish' | 'revert';

const running = new WeakMap<Element, Timeline>();

function resolveTargets(target: Target): Element[] {
  if (typeof target === 'string') return [...document.querySelectorAll(target)];
  if (Array.isArray(target)) return target;
  if (target instanceof Element) return [target];
  return target.value ? [target.value] : [];
}

/**
 * A sequence of animations, sounds and callbacks placed on a time line with labels. Built on
 * Motion; runs in real time (menus animate while the game is paused) or on the game clock.
 * Starting a timeline on elements another timeline is animating interrupts the other one cleanly:
 * the other timeline stops where it is (all its elements and remaining cues), its `play()` promise
 * resolves, and nothing jumps to an end state. Start keyframes from the current value
 * (`{ x: 0 }` rather than `{ x: [-100, 0] }`) to continue smoothly from there.
 *
 * @example
 * ```ts
 * const intro = useTimeline()
 *   .to(title, { x: ['-120%', '0%'] }, { duration: 0.35, ease: 'backOut' })
 *   .sound('ui-slash', '<')
 *   .label('items')
 *   .to('.menu-item', { opacity: [0, 1], x: [40, 0] }, { at: 'items', duration: 0.2 })
 *   .call(() => (ready.value = true));
 * await intro.play();
 * ```
 */
export class Timeline {
  private readonly segments: Segment[] = [];
  private readonly cues: Cue[] = [];
  private readonly labels = new Map<string, number>();
  private cursor = 0;
  private lastStart = 0;
  private controls: ReturnType<typeof animate> | undefined;
  private done: (() => void) | undefined;
  private elements: Element[] = [];
  private stopClock: (() => void) | undefined;
  /** Playback speed; 2 is twice as fast. */
  speed = 1;

  constructor(
    private readonly game: Game | undefined,
    private readonly clock: 'ui' | 'game' = 'ui',
  ) {}

  /** Total length in seconds. */
  get duration(): number {
    return Math.max(
      0,
      ...this.segments.map((s) => s.start + s.duration),
      ...this.cues.map((c) => c.time),
    );
  }

  /** Time of a label. */
  labelTime(name: string): number {
    const time = this.labels.get(name);
    if (time === undefined)
      throw new Error(
        `Unknown timeline label "${name}". Labels: ${[...this.labels.keys()].join(', ') || 'none'}.`,
      );
    return time;
  }

  private resolve(at: number | string | undefined): number {
    if (at === undefined) return this.cursor;
    if (typeof at === 'number') return at;
    if (at === '<') return this.lastStart;
    const relative = /^([+-])(\d*\.?\d+)$/.exec(at);
    if (relative)
      return Math.max(0, this.cursor + (relative[1] === '-' ? -1 : 1) * Number(relative[2]));
    // A label may itself contain "-" ("part-2"): an exact label wins over "label-offset".
    if (this.labels.has(at)) return this.labelTime(at);
    const labelled = /^(.+?)([+-]\d*\.?\d+)?$/.exec(at)!;
    return Math.max(0, this.labelTime(labelled[1]!) + Number(labelled[2] ?? 0));
  }

  /** Animates `target` (element, element ref, selector or list) to keyframes. */
  to(target: Target, keyframes: Keyframes, options: StepOptions = {}): this {
    const start = this.resolve(options.at);
    const duration = options.duration ?? 0.3;
    this.segments.push({ target, keyframes, start, duration, ease: options.ease });
    this.lastStart = start;
    this.cursor = Math.max(this.cursor, start + duration);
    return this;
  }

  /** Names the current point (or `at`) for later steps and `play(label)`. */
  label(name: string, at?: number | string): this {
    this.labels.set(name, this.resolve(at));
    return this;
  }

  /** Runs `callback` at a point of the timeline. */
  call(callback: () => void, at?: number | string): this {
    const time = this.resolve(at);
    this.cues.push({ time, run: callback });
    this.lastStart = time;
    return this;
  }

  private addCue(cue: Cue): this {
    this.cues.push(cue);
    this.lastStart = cue.time;
    return this;
  }

  /** Plays a UI sound (asset key) at a point of the timeline, in sync with the animation. */
  sound(key: string, at?: number | string): this {
    return this.addCue({
      time: this.resolve(at),
      sound: true,
      run: () => {
        try {
          this.game?.audio.play(key, { bus: 'ui' });
        } catch (error) {
          console.warn(`[blacklight] Timeline sound "${key}":`, (error as Error).message);
        }
      },
    });
  }

  /** Plays from the start or from a label. Resolves when it ends (or is interrupted). */
  play(from?: string | number): Promise<void> {
    this.stop('freeze');
    const offset = from === undefined ? 0 : typeof from === 'number' ? from : this.labelTime(from);
    this.elements = this.segments.flatMap((s) => resolveTargets(s.target));
    for (const element of this.elements) {
      const other = running.get(element);
      if (other && other !== this) other.stop('freeze');
      running.set(element, this);
    }
    const sequence = this.segments.flatMap((s) =>
      resolveTargets(s.target).map((element) => [
        element,
        s.keyframes,
        { at: s.start, duration: s.duration, ease: s.ease },
      ]),
    );
    // A silent placeholder keeps the timeline as long as its last cue.
    const controls = animate(
      sequence.length > 0
        ? (sequence as never)
        : ([[{ t: 0 }, { t: 1 }, { duration: this.duration || 0.001 }]] as never),
    );
    this.controls = controls;
    controls.speed = this.speed;
    controls.time = offset;
    const pending = this.cues.filter((c) => c.time >= offset).sort((a, b) => a.time - b.time);
    const fire = () => {
      while (pending.length > 0 && pending[0]!.time <= controls.time + 1e-6) pending.shift()!.run();
    };
    const finished = new Promise<void>((resolve) => (this.done = resolve));
    if (prefersReducedMotion()) {
      // Reduced motion: show the end state at once, still running every cue in order. The
      // promise resolves on the next frame, not at once: a timeline played in a loop
      // (`while (shown) await idle.play()`) would otherwise never let the page draw or answer.
      controls.complete();
      for (const cue of pending.splice(0)) if (!cue.sound) cue.run();
      const frame = requestAnimationFrame(() => this.finish());
      this.stopClock = () => cancelAnimationFrame(frame);
      return finished;
    }
    if (this.clock === 'game' && this.game) {
      controls.pause();
      const off = this.game.events.on('step', () => {
        controls.time = Math.min(
          controls.duration,
          controls.time + this.game!.time.dt * this.speed,
        );
        fire();
        if (controls.time >= controls.duration) this.finish();
      });
      this.stopClock = off;
    } else {
      let frame = 0;
      const tick = () => {
        fire();
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      this.stopClock = () => cancelAnimationFrame(frame);
      void controls.finished.then(
        () => {
          if (this.controls !== controls) return;
          fire();
          this.finish();
        },
        () => undefined,
      );
    }
    fire();
    return finished;
  }

  private finish(): void {
    this.stopClock?.();
    this.stopClock = undefined;
    for (const element of this.elements) if (running.get(element) === this) running.delete(element);
    const done = this.done;
    this.done = undefined;
    this.controls = undefined;
    done?.();
  }

  /**
   * Stops: `'freeze'` keeps the current values, `'finish'` jumps to the end, `'revert'` goes back
   * to the start. The promise from `play()` resolves.
   */
  stop(mode: StopMode = 'freeze'): void {
    const controls = this.controls;
    if (!controls) return;
    if (mode === 'finish') controls.complete();
    else if (mode === 'revert') {
      controls.time = 0;
      controls.pause();
    } else controls.pause();
    this.controls = undefined;
    this.finish();
  }

  /** `true` while playing. */
  get playing(): boolean {
    return this.controls !== undefined;
  }
}
