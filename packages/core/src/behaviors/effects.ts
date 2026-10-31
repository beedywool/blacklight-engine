import type { GameObject } from '../objects/game-object';
import { Behavior } from './behavior';
import { TIME_EPSILON_MS } from '../time-epsilon';

/** Options of {@link Flash} (`behaviors.flash`). */
export interface FlashOptions {
  /** On/off period in ms. @defaultValue `80` */
  interval?: number;
  /** Start flashing for this long (ms) when attached. */
  autoStart?: number;
}

/**
 * Blinks the object (hit invulnerability, warnings). Call `start(ms)`.
 *
 * @example
 * ```ts
 * import { Flash, Sprite, behaviors } from '@blacklight/core';
 *
 * export class Player extends Sprite {
 *   static behaviors = [behaviors.flash({ interval: 60 })];
 *   hurt() {
 *     const flash = this.behavior(Flash)!;
 *     if (!flash.flashing) flash.start(1500);
 *   }
 * }
 * ```
 */
export class Flash extends Behavior<FlashOptions> {
  readonly name = 'flash';
  /** Remaining flash time in ms. */
  remaining = 0;
  private clock = 0;

  override attach(object: GameObject): void {
    super.attach(object);
    if (this.options.autoStart) this.start(this.options.autoStart);
  }

  /** Flashes for `duration` ms. */
  start(duration: number): void {
    this.remaining = duration;
    this.clock = 0;
  }

  /** `true` while the object blinks. */
  get flashing(): boolean {
    return this.remaining > 0;
  }

  override update(object: GameObject, dt: number): void {
    if (this.remaining <= 0) return;
    // The epsilon absorbs float drift, so a 500 ms flash lasts exactly 30 steps at 60 Hz.
    this.remaining -= dt * 1000;
    if (this.remaining <= TIME_EPSILON_MS) this.remaining = 0;
    this.clock += dt * 1000;
    const interval = this.options.interval ?? 80;
    object.visible =
      this.remaining <= 0 || Math.floor((this.clock + TIME_EPSILON_MS) / interval) % 2 === 1;
  }
}

/** Options of {@link Fade} (`behaviors.fade`); durations in ms. */
export interface FadeOptions {
  /** Fade in over this many ms when attached. */
  fadeIn?: number;
  /** Then wait this long (ms) and fade out over `fadeOut` ms. */
  wait?: number;
  /** Fade out over this many ms; omitted, the object only fades out on `fadeOut()`. */
  fadeOut?: number;
  /** Destroy the object once faded out; `false` keeps it, invisible, for a later `fadeIn()`. @defaultValue `true` */
  destroy?: boolean;
}

/**
 * Fades the object in and/or out (popups, damage numbers, ghosts).
 *
 * @example
 * ```ts
 * import { Text, behaviors } from '@blacklight/core';
 *
 * // A damage number that appears, stays half a second and disappears.
 * export class DamageNumber extends Text {
 *   static behaviors = [behaviors.fade({ fadeIn: 100, wait: 500, fadeOut: 300 })];
 * }
 * ```
 */
export class Fade extends Behavior<FadeOptions> {
  readonly name = 'fade';
  private time = 0;
  private outAt: number | undefined;
  /** Alpha the current fade in starts from (0 when attached, the current alpha after `fadeIn()`). */
  private inFrom = 0;

  override attach(object: GameObject): void {
    super.attach(object);
    if (this.options.fadeIn) object.alpha = 0;
    if (this.options.fadeOut !== undefined)
      this.outAt = (this.options.fadeIn ?? 0) + (this.options.wait ?? 0);
  }

  /** Starts fading out now. */
  fadeOut(duration = this.options.fadeOut ?? 300): void {
    this.options.fadeOut = duration;
    this.outAt = this.time;
  }

  /**
   * Starts fading in now, from the current alpha; cancels a fade out in progress. With
   * `destroy: false`, brings back an object that faded out.
   *
   * @example
   * ```ts
   * ghost.behavior(Fade)?.fadeIn(200);
   * ```
   */
  fadeIn(duration = this.options.fadeIn ?? 300): void {
    this.options.fadeIn = duration;
    this.inFrom = this.object.alpha;
    this.time = 0;
    this.outAt = undefined;
  }

  override update(object: GameObject, dt: number): void {
    this.time += dt * 1000;
    const { fadeIn = 0, fadeOut = 0 } = this.options;
    // The epsilon absorbs float drift: 18 steps of 1000 / 60 ms may make 299.999… ms.
    if (this.outAt !== undefined && this.time >= this.outAt - TIME_EPSILON_MS) {
      const out = Math.max(0, this.time - this.outAt);
      const t = out >= fadeOut - TIME_EPSILON_MS ? 1 : out / fadeOut;
      object.alpha = Math.max(0, 1 - t);
      if (t >= 1 && this.options.destroy !== false) object.destroy();
    } else if (fadeIn > 0 && this.time <= fadeIn) {
      object.alpha = Math.min(1, this.inFrom + ((1 - this.inFrom) * this.time) / fadeIn);
    } else if (fadeIn > 0 && object.alpha < 1) {
      object.alpha = 1;
    }
  }
}
