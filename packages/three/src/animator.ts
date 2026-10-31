import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three';
import { findFallback, type Unsubscribe } from '@blacklight/core';

/**
 * How one animation of a model plays (`static animations` of a `Model3D`), the 3D counterpart of
 * an `.anim.json` entry.
 *
 * @example
 * ```ts
 * static animations = {
 *   wave: { loop: false, next: 'idle' },
 *   walk: { speed: 1.2, events: { 0.1: 'step', 0.6: 'step' } },
 * };
 * ```
 */
export interface ModelAnimationSettings {
  /** @defaultValue `true` (`false` when `next` is set) */
  loop?: boolean;
  /** Animation that starts when this one ends. */
  next?: string;
  /** Playback rate. @defaultValue `1` */
  speed?: number;
  /** Cross-fade from the previous animation, in ms. @defaultValue `150` */
  fade?: number;
  /** Events fired when playback passes a time: seconds into the clip → event name(s). */
  events?: Record<string, string | string[]>;
}

/** Options of `Model3D.play()`; they override the animation's settings for this call. */
export interface ModelPlayOptions {
  /** Starts over even when the animation is already playing. */
  restart?: boolean;
  /** Playback rate for this call. */
  speed?: number;
  /** Cross-fade duration in ms; `0` cuts. */
  fade?: number;
  /** Loops this time, whatever the animation's settings say. */
  loop?: boolean;
}

/** Saved animation state (snapshots). */
export interface ModelAnimationState {
  /** Playing animation, `undefined` before the first `play`. */
  name: string | undefined;
  /** Seconds into it. */
  time: number;
  /** Playback rate. */
  speed: number;
  /** The animation was a mirrored fallback. */
  flipX: boolean;
}

/**
 * Plays the skeletal animations of one model instance on the game's fixed step, with the same
 * vocabulary as sprites: `play`, `queue`, `onEnd`, frame events, fallback to a close name.
 * Every `Model3D` has one (`model.animator`) once its file is loaded; most games call the
 * object's own `play` instead.
 *
 * @example
 * ```ts
 * const animator = this.hero.animator!;
 * animator.play('attack', { restart: true, fade: 80 });
 * animator.queue('idle');
 * animator.onEnd((name) => console.log(name, 'ended'));
 * ```
 */
export class ModelAnimator {
  /** The Three.js mixer driving the clips, for blending beyond `play` (additive layers). */
  readonly mixer: AnimationMixer;
  /** Name of the playing (or last played) animation. */
  name: string | undefined;
  /** `true` when the playing animation is a mirrored fallback (`walk-left` shown as `walk-right`). */
  flipX = false;
  /** `true` once a non-looping animation reached its end. */
  finished = false;
  private action: AnimationAction | undefined;
  private readonly clips = new Map<string, AnimationClip>();
  private readonly queued: string[] = [];
  private readonly endListeners = new Set<(name: string) => void>();
  private readonly eventListeners = new Set<(event: string, name: string) => void>();
  private readonly warned = new Set<string>();

  constructor(
    root: Object3D,
    clips: readonly AnimationClip[],
    private readonly settings: Record<string, ModelAnimationSettings> = {},
    private readonly owner = 'Model3D',
  ) {
    this.mixer = new AnimationMixer(root);
    for (const clip of clips) this.clips.set(clip.name, clip);
    this.mixer.addEventListener('finished', (event) => {
      if (event.action !== this.action) return;
      this.finished = true;
      const ended = this.name!;
      for (const listener of this.endListeners) listener(ended);
      const next = this.queued.shift() ?? this.settings[ended]?.next;
      if (next) this.play(next, { restart: true });
    });
  }

  /** Clip names, in file order. */
  get names(): string[] {
    return [...this.clips.keys()];
  }

  /** Seconds into the playing animation. */
  get time(): number {
    return this.action?.time ?? 0;
  }

  /** Playback rate of the playing animation. */
  get speed(): number {
    return this.action?.timeScale ?? 1;
  }
  set speed(value: number) {
    if (this.action) this.action.timeScale = value;
  }

  /**
   * Plays a clip. Calling it every step with the same name keeps it running. A missing name falls
   * back to a close one (`walk-left` → `walk-right` mirrored, `walk`, then the first clip) with a
   * warning.
   *
   * @throws Error when the model has no animation at all.
   */
  play(name: string, options: ModelPlayOptions = {}): void {
    const found = findFallback(name, (n) => this.clips.has(n), this.names[0]);
    if (!found) {
      throw new Error(
        `${this.owner} cannot play "${name}": its model has no animations. Export the clips with the model (glTF animations).`,
      );
    }
    if (found.name !== name && !this.warned.has(name)) {
      this.warned.add(name);
      console.warn(
        `${this.owner} has no animation "${name}"; playing "${found.name}"${found.flipX ? ' mirrored' : ''}. Animations: ${this.names.join(', ')}.`,
      );
    }
    this.flipX = found.flipX;
    if (found.name === this.name && this.action && !options.restart && !this.finished) {
      if (options.speed !== undefined) this.action.timeScale = options.speed;
      return;
    }
    const settings = this.settings[found.name] ?? {};
    const previous = this.action;
    const action = this.mixer.clipAction(this.clips.get(found.name)!);
    const loop = options.loop ?? settings.loop ?? !settings.next;
    action.reset();
    action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = options.speed ?? settings.speed ?? 1;
    action.play();
    const fade = (options.fade ?? settings.fade ?? 150) / 1000;
    if (previous && previous !== action) {
      if (fade > 0) action.crossFadeFrom(previous, fade, false);
      else previous.stop();
    }
    this.action = action;
    this.name = found.name;
    this.finished = false;
  }

  /** Plays `name` once the current animation ends (non-looping animations only). */
  queue(name: string): void {
    if (!this.action || this.finished) this.play(name);
    else this.queued.push(name);
  }

  /** Stops every animation; the model keeps its current pose. */
  stop(): void {
    this.mixer.stopAllAction();
    this.action = undefined;
    this.name = undefined;
    this.queued.length = 0;
  }

  /** Calls `listener` when a non-looping animation ends. */
  onEnd(listener: (name: string) => void): Unsubscribe {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  /** Calls `listener` for each event of `static animations` playback passes. */
  onEvent(listener: (event: string, name: string) => void): Unsubscribe {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Advances by `seconds` of game time. */
  step(seconds: number): void {
    const action = this.action;
    const before = action?.time ?? 0;
    this.mixer.update(seconds);
    if (!action || action !== this.action || this.eventListeners.size === 0) return;
    const events = this.settings[this.name!]?.events;
    if (!events) return;
    const after = action.time;
    const duration = action.getClip().duration;
    const forward = action.timeScale >= 0;
    // A looping clip may wrap around between two steps.
    const wrapped = forward ? after < before : after > before;
    for (const [at, names] of Object.entries(events)) {
      const t = Number(at);
      const passed = forward
        ? wrapped
          ? t > before || t <= after
          : t > before && t <= after
        : wrapped
          ? t < before || t >= after
          : t < before && t >= after;
      if (!passed || t > duration) continue;
      for (const event of Array.isArray(names) ? names : [names])
        for (const listener of this.eventListeners) listener(event, this.name!);
    }
  }

  /** @internal */
  capture(): ModelAnimationState {
    return { name: this.name, time: this.time, speed: this.speed, flipX: this.flipX };
  }

  /** @internal */
  restore(state: ModelAnimationState): void {
    if (!state.name) {
      this.stop();
      return;
    }
    this.play(state.name, { restart: true, fade: 0, speed: state.speed });
    this.action!.time = state.time;
    this.flipX = state.flipX;
    this.mixer.update(0);
  }
}
