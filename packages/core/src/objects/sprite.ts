import { Sprite as PixiSprite, type Texture } from 'pixi.js';
import { Animator, type AnimationFileInput, type AnimationFrameEvent } from '../anim/animator';
import type { LoadedSheet } from '../anim/sheet-cache';
import { IMAGE_EXTENSIONS } from '../assets';
import type { HitboxSpec, LocalPixelShape } from '../collision/shapes';
import type { Unsubscribe } from '../events';
import type { AnimationName, AssetKey } from '../register';
import { GameObject } from './game-object';

/**
 * A game object drawn from an image or a sprite sheet, with animations.
 *
 * Frames come from `static animations` (an imported `.anim.json`), `static texture`, or by
 * convention from the object's folder: `player.aseprite.json`, `player@32x32.png` or `player.png`.
 *
 * @example
 * ```ts
 * import anims from './player.anim.json';
 *
 * export default class Player extends Sprite {
 *   static animations = anims;
 *   static behaviors = [behaviors.eightDirections({ speed: 240 })];
 *   update() {
 *     this.play(this.velocity.length > 0 ? 'run' : 'idle');
 *   }
 * }
 * ```
 */
export class Sprite extends GameObject {
  static override hitbox: HitboxSpec = 'auto';
  /** Animation file (usually `import anims from './x.anim.json'`). */
  static animations: AnimationFileInput | undefined;
  /** Single image, relative to the object's folder or an asset key. */
  static texture: AssetKey | undefined;

  /** The displayed Pixi sprite. */
  readonly view = new PixiSprite();
  /** Plays the animations; `undefined` for sprites without a sheet. */
  animator: Animator | undefined;
  private loaded: LoadedSheet | undefined;
  private flip = { x: false, y: false };
  private readonly frameListeners = new Set<(event: AnimationFrameEvent) => void>();
  private readonly endListeners = new Set<(name: string) => void>();

  constructor() {
    super();
    this.view.anchor.set(0.5);
    this.addChild(this.view);
    this.markEngineKeys();
  }

  /** @internal Called by the scene when the object is spawned. */
  initSheet(sheet: LoadedSheet | undefined): void {
    this.loaded = sheet;
    if (!sheet) return;
    this.animator = new Animator(
      sheet.animations,
      {
        frame: ({ animation, frame, sheetFrame, events }) => {
          this.showFrame(sheetFrame);
          for (const event of events)
            for (const listener of this.frameListeners)
              listener({ event, animation, frame, sheetFrame });
        },
        end: (name) => {
          for (const listener of this.endListeners) listener(name);
        },
      },
      sheet.defaultAnimation,
    );
    if (sheet.defaultAnimation) this.animator.play(sheet.defaultAnimation);
    else this.showFrame(0);
  }

  /** Name of the playing animation. */
  get animation(): string | undefined {
    return this.animator?.name;
  }

  /** Index of the current frame within the animation. */
  get frame(): number {
    return this.animator?.index ?? 0;
  }

  /** Animation names this sprite has. */
  get animationNames(): string[] {
    return [...(this.loaded?.animations.keys() ?? [])];
  }

  /**
   * Plays an animation. Calling it every step with the same name keeps it running; `restart`
   * starts it over. A missing name falls back to the closest one (`walk-left` → `walk-right`
   * mirrored, `walk`, then the default animation) with a warning. Clears the `queue()`; the
   * animation it replaces does not fire `onEnd`.
   */
  play(name: AnimationName, options: { restart?: boolean; speed?: number } = {}): this {
    if (!this.animator)
      throw new Error(
        `${this.objectName} has no animations to play "${name}". Give it a sheet or an .anim.json.`,
      );
    this.animator.play(name, options.restart);
    if (options.speed !== undefined) this.animator.speed = options.speed;
    this.applyFlip();
    return this;
  }

  /**
   * Plays `name` after the current animation and anything queued before it: when a non-looping
   * animation ends (after `onEnd`, instead of its `next`) or a looping one completes its loop.
   * Plays it now when the current animation has already ended.
   *
   * @example
   * ```ts
   * this.play('attack', { restart: true }).queue('recover').queue('idle');
   * ```
   */
  queue(name: AnimationName): this {
    this.animator?.queue(name);
    return this;
  }

  /**
   * Listens to an event of the `.anim.json` (`"events": { "2": "step" }`), fired when the frame
   * it is attached to starts. The listener gets the event, the animation and the frame index
   * within it (the key in `events`, `2` here) and in the sheet. Returns a function that removes
   * the listener.
   *
   * @example
   * ```ts
   * this.onFrame('step', ({ animation, frame }) => {
   *   this.scene.audio.play(frame === 0 ? 'step-left' : 'step-right');
   * });
   * ```
   */
  onFrame(event: string, listener: (event: AnimationFrameEvent) => void): Unsubscribe {
    const wrapped = (fired: AnimationFrameEvent) => {
      if (fired.event === event) listener(fired);
    };
    this.frameListeners.add(wrapped);
    return () => this.frameListeners.delete(wrapped);
  }

  /**
   * Called when a non-looping animation ends: once per play, when its last frame has shown for its
   * full duration, before a queued or `next` animation starts. Not called for an animation that
   * `play()` replaces before its end (like `animationcancel` in CSS) or for looping animations.
   *
   * @example
   * ```ts
   * this.onEnd((animation) => {
   *   if (animation === 'die') this.destroy();
   * });
   * ```
   */
  onEnd(listener: (animation: string) => void): Unsubscribe {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  override snapshotState() {
    return { flipX: this.flip.x, flipY: this.flip.y };
  }

  override restoreState(state: Record<string, unknown>): void {
    this.flipX = !!state.flipX;
    this.flipY = !!state.flipY;
  }

  /** Mirrors the sprite horizontally (combined with mirrored fallback animations). */
  get flipX(): boolean {
    return this.flip.x;
  }
  set flipX(value: boolean) {
    this.flip.x = value;
    this.applyFlip();
  }

  /** Mirrors the sprite vertically. */
  get flipY(): boolean {
    return this.flip.y;
  }
  set flipY(value: boolean) {
    this.flip.y = value;
    this.applyFlip();
  }

  /** Anchor of the image (0–1), 0.5 by default. Overridden by `pivot` in the animation file. */
  get anchor() {
    return this.view.anchor;
  }

  /** Displayed texture. Setting it stops the animation. */
  get texture(): Texture {
    return this.view.texture;
  }
  set texture(value: Texture) {
    if (this.animator) this.animator.paused = true;
    this.view.texture = value;
  }

  /** Shows an image by key or path (it must be preloaded). */
  setTexture(keyOrPath: AssetKey): this {
    const path = this.game.assets.find(keyOrPath, {
      baseDir: (this.constructor as typeof Sprite).objectPath,
      extensions: IMAGE_EXTENSIONS,
    })[0]!;
    this.texture = this.game.assets.texture(path);
    return this;
  }

  /** @internal Redraws the animator's current frame (after restoring a snapshot). */
  syncFrame(): void {
    if (this.animator) this.showFrame(this.animator.sheetFrame);
  }

  private showFrame(frame: number): void {
    const texture = this.loaded?.textures[frame];
    if (!texture) return;
    this.view.texture = texture;
    const pivot =
      this.animator?.frameOverride.pivot ??
      this.loaded?.sheet.slices.map((s) => s.pivot(frame)).find(Boolean);
    // Frame sizes are untrimmed (`orig`): Aseprite slices and pivots use the full frame.
    if (pivot) this.view.anchor.set(pivot.x / texture.orig.width, pivot.y / texture.orig.height);
    this.applyFlip();
  }

  private applyFlip(): void {
    const mirrored = this.flip.x !== (this.animator?.flipX ?? false);
    this.view.scale.set(mirrored ? -1 : 1, this.flip.y ? -1 : 1);
  }

  protected override stepInternal(dt: number): void {
    this.animator?.step(dt * 1000);
  }

  protected override currentHitbox(): HitboxSpec {
    const override = this.animator?.frameOverride.hitbox;
    if (override) return mirror(override, this.view.scale.x < 0, this.view.scale.y < 0);
    if (this.hitbox !== 'auto')
      return mirror(this.hitbox, this.view.scale.x < 0, this.view.scale.y < 0);
    // An Aseprite slice named "hitbox" gives a per-frame box, in frame pixels.
    const bounds = this.slice('hitbox')?.bounds(this.animator?.sheetFrame ?? 0);
    if (!bounds) return 'auto';
    const frame = this.view.texture.orig;
    const ox = this.view.anchor.x * frame.width;
    const oy = this.view.anchor.y * frame.height;
    const x = this.view.scale.x < 0 ? frame.width - bounds.x - bounds.width : bounds.x;
    const y = this.view.scale.y < 0 ? frame.height - bounds.y - bounds.height : bounds.y;
    return { type: 'box', x: x - ox, y: y - oy, width: bounds.width, height: bounds.height };
  }

  private slice(name: string) {
    return this.loaded?.sheet.slices.find((s) => s.name === name);
  }

  /** The current frame's rectangle around the anchor (flips included). */
  protected override autoHitbox(): Exclude<HitboxSpec, 'auto' | 'none' | 'pixel'> | undefined {
    const frame = this.view.texture.orig;
    if (frame.width <= 1 && frame.height <= 1) return undefined;
    const sx = this.view.scale.x;
    const sy = this.view.scale.y;
    const left =
      sx < 0 ? -(1 - this.view.anchor.x) * frame.width : -this.view.anchor.x * frame.width;
    const top =
      sy < 0 ? -(1 - this.view.anchor.y) * frame.height : -this.view.anchor.y * frame.height;
    return { type: 'box', x: left, y: top, width: frame.width, height: frame.height };
  }

  /** The opaque pixels of the current frame, placed like {@link Sprite.autoHitbox}. */
  protected override pixelHitbox():
    Exclude<HitboxSpec, 'auto' | 'none' | 'pixel'> | LocalPixelShape | undefined {
    const box = this.autoHitbox();
    const mask = this.loaded?.mask(this.animator?.sheetFrame ?? 0);
    if (!box || box.type !== 'box' || !mask) return box;
    // The mask covers the trimmed pixels only; place it inside the untrimmed frame.
    const { orig, trim } = this.view.texture;
    const t = trim ?? { x: 0, y: 0, width: orig.width, height: orig.height };
    const x = this.view.scale.x < 0 ? orig.width - t.x - t.width : t.x;
    const y = this.view.scale.y < 0 ? orig.height - t.y - t.height : t.y;
    return {
      type: 'pixel' as const,
      rect: { x: (box.x ?? 0) + x, y: (box.y ?? 0) + y, width: t.width, height: t.height },
      mask,
      flipX: this.view.scale.x < 0,
      flipY: this.view.scale.y < 0,
    };
  }
}

/** Mirrors a local hitbox around the object's origin (for flipped sprites). */
function mirror(spec: HitboxSpec, flipX: boolean, flipY: boolean): HitboxSpec {
  if (typeof spec === 'string' || (!flipX && !flipY)) return spec;
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  switch (spec.type) {
    case 'box':
      return {
        type: 'box',
        x: flipX ? -((spec.x ?? 0) + spec.width) : spec.x,
        y: flipY ? -((spec.y ?? 0) + spec.height) : spec.y,
        width: spec.width,
        height: spec.height,
      };
    case 'circle':
      return { ...spec, x: (spec.x ?? 0) * sx, y: (spec.y ?? 0) * sy };
    case 'polygon':
      return { type: 'polygon', points: spec.points.map(([x, y]) => [x * sx, y * sy]) };
  }
}

/**
 * Same as {@link Sprite}, which already plays animations; the name reads better for animated
 * objects.
 *
 * @example
 * ```ts
 * import { AnimatedSprite } from '@blacklight/core';
 * import anims from './bat.anim.json';
 *
 * export class Bat extends AnimatedSprite {
 *   static animations = anims;
 *   create() {
 *     this.play('fly');
 *   }
 * }
 * ```
 */
export class AnimatedSprite extends Sprite {}
