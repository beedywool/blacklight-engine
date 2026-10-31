import type { Point } from '../math';
import type { HitboxSpec } from '../collision/shapes';
import type { Sheet } from './sheets';

/** Per-frame overrides of hitbox and pivot. */
export interface FrameOverride {
  /** Hitbox while this frame shows (an attack frame with a longer reach). */
  hitbox?: HitboxSpec;
  /** Pivot in frame pixels (the point placed at the object's position). */
  pivot?: Point;
}

/** One animation in an `.anim.json` file. */
export interface AnimationDef {
  /**
   * Frames: an Aseprite tag name, frame indices, or an inclusive range. Omitted: the Aseprite tag
   * with the animation's name, or every frame.
   */
  frames?:
    | string
    | number[]
    | {
        /** First sheet frame index, included. */
        from: number;
        /** Last sheet frame index, included. */
        to: number;
      };
  /** Frames per second. Omitted: Aseprite frame durations, else the file's `fps`. */
  fps?: number;
  /** Starts over after the last frame. @defaultValue `true` */
  loop?: boolean;
  /** Plays forward then backward. */
  pingPong?: boolean;
  /** Plays the frames in reverse order. */
  reverse?: boolean;
  /** Animation that starts when this one ends (implies `loop: false`). */
  next?: string;
  /** Events fired when a frame starts: frame index within this animation → event name(s). */
  events?: Record<string, string | string[]>;
  /** Hitbox while this animation plays, instead of the file's or the object's. */
  hitbox?: HitboxSpec;
  /** Pivot of this animation's frames, in frame pixels. */
  pivot?: Point;
  /** Overrides for some frames, by frame index within this animation. */
  frameOverrides?: Record<string, FrameOverride>;
}

/**
 * Content of `<object>.anim.json` (JSON Schema: `@blacklight/core/schema/anim.schema.json`).
 *
 * @example
 * ```json
 * {
 *   "source": "./player.aseprite.json",
 *   "default": "idle",
 *   "animations": {
 *     "idle": { "fps": 6 },
 *     "run": { "frames": "run", "events": { "1": "step", "3": "step" } },
 *     "attack": { "loop": false, "next": "idle" }
 *   }
 * }
 * ```
 */
export interface AnimationFile {
  /** Path or URL of the JSON Schema, for editors; ignored by the engine. */
  $schema?: string;
  /**
   * Frame source relative to the object folder: an Aseprite JSON (`player.aseprite.json`), a grid
   * image named with its frame size (`player@32x32.png`) or a single image.
   */
  source?: string;
  /** Default frame rate. @defaultValue `10` */
  fps?: number;
  /** Animation played on spawn. Defaults to the first one. */
  default?: string;
  /** Pivot for every frame, in frame pixels. Defaults to the frame center. */
  pivot?: Point;
  /** Hitbox for every animation that does not set its own. */
  hitbox?: HitboxSpec;
  /** Animations by name (`idle`, `walk-left`…), the names `play()` takes. */
  animations: Record<string, AnimationDef>;
}

/**
 * What `import anims from './x.anim.json'` gives TypeScript: an {@link AnimationFile} whose
 * hitboxes are not narrowed yet (JSON strings are not literal types). Accepted by
 * `static animations`; validated against the schema in the editor.
 */
export type AnimationFileInput = Omit<AnimationFile, 'hitbox' | 'animations'> & {
  /** {@link AnimationFile.hitbox}, checked when the sprite loads. */
  hitbox?: unknown;
  /** {@link AnimationFile.animations}, hitboxes checked when the sprite loads. */
  animations: Record<
    string,
    Omit<AnimationDef, 'hitbox' | 'frameOverrides'> & {
      /** {@link AnimationDef.hitbox}, checked when the sprite loads. */
      hitbox?: unknown;
      /** {@link AnimationDef.frameOverrides}, hitboxes checked when the sprite loads. */
      frameOverrides?: Record<
        string,
        {
          /** {@link FrameOverride.hitbox}, checked when the sprite loads. */
          hitbox?: unknown;
          /** {@link FrameOverride.pivot}. */
          pivot?: Point;
        }
      >;
    }
  >;
};

/**
 * An animation ready to play: frames, durations and events resolved against the sheet by
 * {@link resolveAnimations}. {@link Animator} plays them.
 */
export interface ResolvedAnimation {
  /** Animation name from the file. */
  name: string;
  /** Sheet frame index of each step of the animation. */
  frames: number[];
  /** Duration of each step in ms. */
  durations: number[];
  /** Starts over after the last frame. */
  loop: boolean;
  /** Animation played when this one ends. */
  next?: string;
  /** Event names fired when a step starts, by step index. */
  events: Map<number, string[]>;
  /** Hitbox and pivot overrides, by step index. */
  overrides: Map<number, FrameOverride>;
  /** Hitbox of the whole animation (the animation's or the file's). */
  hitbox?: HitboxSpec;
  /** Pivot of the whole animation (the animation's or the file's), in frame pixels. */
  pivot?: Point;
}

const DIRECTIONS = ['right', 'downright', 'down', 'downleft', 'left', 'upleft', 'up', 'upright'];
const MIRROR: Record<string, string> = {
  left: 'right',
  right: 'left',
  upleft: 'upright',
  upright: 'upleft',
  downleft: 'downright',
  downright: 'downleft',
};

/**
 * Builds playable animations from an animation file and its parsed sheet: picks the frames of
 * each animation (Aseprite tag, indices or range), applies reverse and ping-pong and computes the
 * frame durations. Sprites do this when they load; call it to play `.anim.json` files on
 * something that is not a sprite.
 *
 * @throws Error when an animation names a tag the sheet lacks or a frame outside the sheet.
 *
 * @example
 * ```ts
 * import { gridSheet, resolveAnimations } from '@blacklight/core';
 *
 * const sheet = gridSheet({ width: 64, height: 64, spacing: 0 }, 256, 64); // 4 frames
 * const animations = resolveAnimations({ animations: { spin: { fps: 12 } } }, sheet);
 * animations.get('spin')!.frames; // [0, 1, 2, 3]
 * ```
 */
export function resolveAnimations(
  file: AnimationFile,
  sheet: Sheet,
): Map<string, ResolvedAnimation> {
  const result = new Map<string, ResolvedAnimation>();
  const baseFps = file.fps ?? 10;
  for (const [name, def] of Object.entries(file.animations)) {
    let indices: number[];
    let repeatOnce = false;
    const source = def.frames ?? name;
    if (typeof source === 'string') {
      const tag = sheet.tags.find((t) => t.name === source);
      if (tag) {
        indices = range(tag.from, tag.to);
        if (tag.direction === 'reverse' || tag.direction === 'pingpong_reverse') indices.reverse();
        if (tag.direction.startsWith('pingpong') && def.pingPong === undefined)
          indices = pingPong(indices);
        // Aseprite "repeat": play the tag N times then stop, unless the file says otherwise.
        if (tag.repeat && def.loop === undefined && !def.next) {
          indices = Array.from({ length: tag.repeat }, () => indices).flat();
          repeatOnce = true;
        }
      } else if (def.frames === undefined) {
        indices = range(0, sheet.frames.length - 1);
      } else {
        const known = sheet.tags.map((t) => `"${t.name}"`).join(', ') || 'none';
        throw new Error(
          `Animation "${name}" uses the tag "${source}", which the sheet does not have. Tags: ${known}.`,
        );
      }
    } else if (Array.isArray(source)) {
      indices = [...source];
    } else {
      indices = range(source.from, source.to);
    }
    for (const index of indices) {
      if (index < 0 || index >= sheet.frames.length) {
        throw new Error(
          `Animation "${name}" uses frame ${index}; the sheet has frames 0 to ${sheet.frames.length - 1}.`,
        );
      }
    }
    if (def.reverse) indices.reverse();
    if (def.pingPong) indices = pingPong(indices);
    const durations = indices.map((i) =>
      def.fps ? 1000 / def.fps : (sheet.frames[i]?.duration ?? 1000 / baseFps),
    );
    const events = new Map<number, string[]>();
    for (const [frame, value] of Object.entries(def.events ?? {})) {
      events.set(Number(frame), Array.isArray(value) ? value : [value]);
    }
    const overrides = new Map<number, FrameOverride>();
    for (const [frame, value] of Object.entries(def.frameOverrides ?? {}))
      overrides.set(Number(frame), value);
    result.set(name, {
      name,
      frames: indices,
      durations,
      loop: def.next || repeatOnce ? false : (def.loop ?? true),
      next: def.next,
      events,
      overrides,
      hitbox: def.hitbox ?? file.hitbox,
      pivot: def.pivot ?? file.pivot,
    });
  }
  return result;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function pingPong(indices: number[]): number[] {
  return indices.length > 2 ? [...indices, ...indices.slice(1, -1).reverse()] : indices;
}

/**
 * Finds what to play for `name` when it does not exist: the same action facing a near direction
 * (`walk-upleft` → `walk-up`), its horizontal mirror (`walk-left` → `walk-right` flipped), the
 * action without direction (`walk`), then `fallback`. Returns `undefined` when nothing fits.
 *
 * @example
 * ```ts
 * import { findFallback } from '@blacklight/core';
 *
 * const names = new Set(['idle', 'walk-right']);
 * findFallback('walk-left', (n) => names.has(n), 'idle'); // { name: 'walk-right', flipX: true }
 * ```
 */
export function findFallback(
  name: string,
  has: (name: string) => boolean,
  fallback: string | undefined,
):
  | {
      /** Animation to play. */
      name: string;
      /** Whether to mirror it horizontally. */
      flipX: boolean;
    }
  | undefined {
  if (has(name)) return { name, flipX: false };
  const dash = name.lastIndexOf('-');
  const base = dash > 0 ? name.slice(0, dash) : name;
  const direction = dash > 0 ? name.slice(dash + 1) : '';
  const index = DIRECTIONS.indexOf(direction);
  if (index >= 0) {
    const mirror = MIRROR[direction];
    if (mirror && has(`${base}-${mirror}`)) return { name: `${base}-${mirror}`, flipX: true };
    for (let step = 1; step <= 4; step++) {
      for (const candidate of [index + step, index - step]) {
        const near = DIRECTIONS[(candidate + 8) % 8]!;
        if (has(`${base}-${near}`)) return { name: `${base}-${near}`, flipX: false };
        const nearMirror = MIRROR[near];
        if (nearMirror && has(`${base}-${nearMirror}`))
          return { name: `${base}-${nearMirror}`, flipX: true };
      }
    }
    if (has(base)) return { name: base, flipX: false };
  }
  return fallback !== undefined && has(fallback) ? { name: fallback, flipX: false } : undefined;
}

export interface AnimatorCallbacks {
  /** A frame started: sheet frame index and the events attached to it. */
  frame(sheetFrame: number, events: readonly string[]): void;
  /** A non-looping animation reached its last frame and finished. */
  end(name: string): void;
}

/**
 * Plays resolved animations on the fixed step. Pure logic, no rendering: the sprite reads
 * `sheetFrame` and `flipX` after each step. Every {@link Sprite} with a sheet has one as
 * `sprite.animator`; games mostly use it for `speed` and `paused`.
 *
 * @example
 * ```ts
 * import { Animator, gridSheet, resolveAnimations } from '@blacklight/core';
 *
 * // Drive a plain Pixi sprite from an .anim.json, outside the scene objects.
 * const sheet = gridSheet({ width: 64, height: 64, spacing: 0 }, 512, 64);
 * const animations = resolveAnimations({ animations: { idle: { frames: { from: 0, to: 7 } } } }, sheet);
 * const animator = new Animator(animations, {
 *   frame: (frame) => (pixiSprite.texture = textures[frame]!),
 *   end: () => {},
 * });
 * animator.play('idle');
 * game.events.on('step', () => animator.step(1000 / 60));
 * ```
 */
export class Animator {
  /** The playing animation, `undefined` before the first `play()`. */
  current: ResolvedAnimation | undefined;
  /** Index within the current animation. */
  index = 0;
  /** Time spent on the current step, in ms. */
  elapsed = 0;
  /** The animation plays mirrored (a fallback such as `walk-left` → `walk-right`). */
  flipX = false;
  /** A non-looping animation reached its end; `play()` or `queue()` starts another. */
  finished = false;
  /** Speed multiplier. */
  speed = 1;
  /** Holds the current frame; `step()` does nothing while `true`. */
  paused = false;
  private queued: string[] = [];
  private readonly warned = new Set<string>();

  constructor(
    /** Animations by name, from {@link resolveAnimations}. */
    readonly animations: Map<string, ResolvedAnimation>,
    private readonly callbacks: AnimatorCallbacks,
    /** Animation played when a requested one has no fallback; the first one by default. */
    readonly defaultName: string | undefined = animations.keys().next().value,
  ) {}

  /** Name of the playing animation. */
  get name(): string | undefined {
    return this.current?.name;
  }

  /** Sheet frame index shown now (0 before the first `play()`). */
  get sheetFrame(): number {
    return this.current?.frames[this.index] ?? 0;
  }

  /**
   * Plays `name`. Playing the animation already running does nothing unless `restart` is set.
   * A missing name plays the closest one (see {@link findFallback}) and warns once.
   */
  play(name: string, restart = false): void {
    const found = findFallback(name, (n) => this.animations.has(n), this.defaultName);
    if (!found) throw new Error(`No animation "${name}" and no default animation to fall back to.`);
    if (found.name !== name && !this.warned.has(name)) {
      this.warned.add(name);
      console.warn(
        `[blacklight] Animation "${name}" does not exist; playing "${found.name}"${found.flipX ? ' mirrored' : ''}.`,
      );
    }
    this.queued = [];
    if (
      !restart &&
      this.current?.name === found.name &&
      this.flipX === found.flipX &&
      !this.finished
    )
      return;
    this.current = this.animations.get(found.name)!;
    this.flipX = found.flipX;
    this.index = 0;
    this.elapsed = 0;
    this.finished = false;
    this.emitFrame();
  }

  /** Plays `name` when the current animation ends (or completes its loop). */
  queue(name: string): void {
    if (!this.current || this.finished) this.play(name);
    else this.queued.push(name);
  }

  /** Advances by `ms` of game time. */
  step(ms: number): void {
    const animation = this.current;
    if (!animation || this.paused || this.finished) return;
    this.elapsed += ms * this.speed;
    for (;;) {
      const duration = animation.durations[this.index] ?? 100;
      if (this.elapsed < duration) return;
      this.elapsed -= duration;
      const last = this.index === animation.frames.length - 1;
      if (!last) {
        this.index++;
        this.emitFrame();
        continue;
      }
      const queued = this.queued.shift();
      if (queued) {
        this.play(queued, true);
        return;
      }
      if (animation.loop) {
        this.index = 0;
        this.emitFrame();
        continue;
      }
      this.finished = true;
      this.elapsed = 0;
      this.callbacks.end(animation.name);
      if (animation.next && this.current === animation) this.play(animation.next, true);
      return;
    }
  }

  /** Frame override (hitbox, pivot) of the current frame, merged over the animation's. */
  get frameOverride(): FrameOverride {
    const animation = this.current;
    const override = animation?.overrides.get(this.index);
    return {
      hitbox: override?.hitbox ?? animation?.hitbox,
      pivot: override?.pivot ?? animation?.pivot,
    };
  }

  private emitFrame(): void {
    const animation = this.current!;
    this.callbacks.frame(animation.frames[this.index]!, animation.events.get(this.index) ?? []);
  }
}
