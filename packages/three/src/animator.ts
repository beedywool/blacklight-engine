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

/**
 * An event of `static animations` (`events: { 0.4: 'step' }`), as `Model3D.onFrame` listeners
 * receive it.
 *
 * @example
 * ```ts
 * this.onFrame('step', ({ animation, time }) => {
 *   if (animation === 'run') this.scene.audio.play(time < 0.5 ? 'step-left' : 'step-right');
 * });
 * ```
 */
export interface ModelFrameEvent {
  /** Event name from the animation's `events`. */
  event: string;
  /** Name of the playing animation (clip). */
  animation: string;
  /** Time of the event in the clip, in seconds: its key in `events`. */
  time: number;
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
  /** Animations waiting in `queue()`, in order. */
  queued?: string[];
}

/**
 * Plays the skeletal animations of one model instance on the game's fixed step, with the same
 * vocabulary and rules as sprites: `play`, `queue`, `onEnd`, frame events, fallback to a close
 * name. A non-looping clip ends once, after the events of its last step and before a queued or
 * `next` clip starts; `play()` replaces a clip without ending it. Every `Model3D` has one
 * (`model.animator`) once its file is loaded; most games call the object's own `play` instead.
 *
 * @example
 * ```ts
 * const animator = this.hero.animator!;
 * animator.play('attack', { restart: true, fade: 80 });
 * animator.queue('idle');
 * animator.onEnd((name) => console.log(name, 'ended'));
 * animator.onEvent(({ event, time }) => console.log(event, 'at', time, 's'));
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
  private queued: string[] = [];
  /** Action that finished or looped during the current `mixer.update`, handled after it. */
  private ended: AnimationAction | undefined;
  private looped: AnimationAction | undefined;
  private readonly endListeners = new Set<(name: string) => void>();
  private readonly eventListeners = new Set<(event: ModelFrameEvent) => void>();
  private readonly warned = new Set<string>();

  constructor(
    root: Object3D,
    clips: readonly AnimationClip[],
    private readonly settings: Record<string, ModelAnimationSettings> = {},
    private readonly owner = 'Model3D',
  ) {
    this.mixer = new AnimationMixer(root);
    for (const clip of clips) this.clips.set(clip.name, clip);
    // The mixer reports ends and loops in the middle of its update; they are handled after the
    // step's events, so a clip's last events come before its end and the next clip.
    this.mixer.addEventListener('finished', (event) => {
      if (event.action === this.action) this.ended = event.action;
    });
    this.mixer.addEventListener('loop', (event) => {
      if (event.action === this.action) this.looped = event.action;
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
   * warning. Clears the `queue()`; the clip it replaces does not fire `onEnd`.
   *
   * @throws Error when the model has no animation at all.
   */
  play(name: string, options: ModelPlayOptions = {}): void {
    this.queued = [];
    this.start(name, options);
  }

  private start(name: string, options: ModelPlayOptions): void {
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

  /**
   * Plays `name` after the current animation and anything queued before it: when a non-looping
   * clip ends (after `onEnd`, instead of its `next`) or a looping one completes its loop. Plays it
   * now when nothing plays or the current clip has ended.
   */
  queue(name: string): void {
    this.queued.push(name);
    if (!this.action || this.finished) this.start(this.queued.shift()!, {});
  }

  /** Stops every animation; the model keeps its current pose. */
  stop(): void {
    this.mixer.stopAllAction();
    this.action = undefined;
    this.name = undefined;
    this.queued = [];
  }

  /**
   * Calls `listener` when a non-looping animation ends: once per play, before a queued or `next`
   * clip starts. Not called for a clip that `play()` replaces or for looping clips.
   */
  onEnd(listener: (name: string) => void): Unsubscribe {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  /** Calls `listener` for each event of `static animations` playback passes. */
  onEvent(listener: (event: ModelFrameEvent) => void): Unsubscribe {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Advances by `seconds` of game time. */
  step(seconds: number): void {
    const action = this.action;
    const before = action?.time ?? 0;
    this.ended = this.looped = undefined;
    this.mixer.update(seconds);
    if (!action || action !== this.action) return;
    const name = this.name!;
    // A clip that loops into a queued one stops at its end: later events belong to its next loop.
    const leaving = this.looped === action && this.queued.length > 0;
    this.fireEvents(action, name, before, leaving);
    if (this.ended === action) {
      this.finished = true;
      for (const listener of this.endListeners) listener(name);
      // An end listener that called play() or queue() has already chosen what plays next.
      if (this.action !== action || !this.finished) return;
      const next = this.queued.shift() ?? this.settings[name]?.next;
      if (next) this.start(next, { restart: true });
    } else if (leaving) {
      this.start(this.queued.shift()!, { restart: true });
    }
  }

  private fireEvents(
    action: AnimationAction,
    name: string,
    before: number,
    leaving: boolean,
  ): void {
    const events = this.settings[name]?.events;
    if (!events || this.eventListeners.size === 0) return;
    const duration = action.getClip().duration;
    const forward = action.timeScale >= 0;
    const after = leaving ? (forward ? duration : 0) : action.time;
    // A looping clip may wrap around between two steps.
    const wrapped = !leaving && (forward ? after < before : after > before);
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
        for (const listener of this.eventListeners) listener({ event, animation: name, time: t });
    }
  }

  /** @internal */
  capture(): ModelAnimationState {
    return {
      name: this.name,
      time: this.time,
      speed: this.speed,
      flipX: this.flipX,
      queued: [...this.queued],
    };
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
    this.queued = [...(state.queued ?? [])];
    this.mixer.update(0);
  }
}
