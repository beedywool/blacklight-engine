import { DMath } from './dmath';

/**
 * A mutable 2D vector. Speeds in the engine are in virtual pixels per second. Methods that change
 * the vector return it, so calls chain; use {@link Vector2.clone} first to keep the original.
 *
 * @example
 * ```ts
 * import { Vector2 } from '@blacklight/core';
 *
 * const velocity = new Vector2(3, 4).normalize().scale(200); // 200 px/s towards (3, 4)
 * player.x += velocity.x * dt;
 * ```
 */
export class Vector2 {
  constructor(
    /** Horizontal component, growing to the right. */
    public x = 0,
    /** Vertical component, growing downwards (screen coordinates). */
    public y = 0,
  ) {}

  /** Euclidean length. */
  get length(): number {
    return DMath.hypot(this.x, this.y);
  }

  /** Angle in radians, 0 pointing right, growing clockwise (screen coordinates). */
  get angle(): number {
    return DMath.atan2(this.y, this.x);
  }

  /** Sets both components. */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /** Copies the components of any `{ x, y }` object (a point, a game object). */
  copy(other: { x: number; y: number }): this {
    return this.set(other.x, other.y);
  }

  /** A new vector with the same components. */
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /** Adds `other` component by component. */
  add(other: { x: number; y: number }): this {
    return this.set(this.x + other.x, this.y + other.y);
  }

  /** Multiplies both components by `factor`. */
  scale(factor: number): this {
    return this.set(this.x * factor, this.y * factor);
  }

  /** Scales to length 1; a zero vector stays zero. */
  normalize(): this {
    const length = this.length;
    return length > 0 ? this.scale(1 / length) : this;
  }

  /** Shortens the vector to `max` when it is longer. */
  limit(max: number): this {
    const length = this.length;
    return length > max ? this.scale(max / length) : this;
  }

  /** Whether both components are exactly equal to those of `other`. */
  equals(other: { x: number; y: number }): boolean {
    return this.x === other.x && this.y === other.y;
  }

  /** A plain `{ x, y }` object, used by `JSON.stringify` (saves, snapshots). */
  toJSON(): Point {
    return { x: this.x, y: this.y };
  }
}

/** A position in virtual pixels: x to the right, y downwards. */
export interface Point {
  /** Horizontal position. */
  x: number;
  /** Vertical position. */
  y: number;
}

/** An axis-aligned rectangle in virtual pixels, from its top-left corner. */
export interface Rect {
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  /** Width, to the right of `x`. */
  width: number;
  /** Height, below `y`. */
  height: number;
}

/**
 * Restricts `value` to the range `[min, max]`.
 *
 * @example
 * ```ts
 * import { clamp } from '@blacklight/core';
 *
 * player.health = clamp(player.health + heal, 0, 100);
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation: `from` at `t = 0`, `to` at `t = 1`. `t` is not clamped.
 *
 * @example
 * ```ts
 * import { lerp } from '@blacklight/core';
 *
 * bar.width = lerp(0, 200, loaded / total);
 * ```
 */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Moves `from` towards `to` by at most `step`, without overshooting. Useful for acceleration and
 * friction applied every frame.
 *
 * @example
 * ```ts
 * import { approach } from '@blacklight/core';
 *
 * // Slow down to a stop at 600 px/s².
 * speed = approach(speed, 0, 600 * dt);
 * ```
 */
export function approach(from: number, to: number, step: number): number {
  return from < to ? Math.min(from + step, to) : Math.max(from - step, to);
}

/**
 * Euclidean distance between two points.
 *
 * @example
 * ```ts
 * import { distance } from '@blacklight/core';
 *
 * if (distance(player, enemy) < 64) enemy.velocity.set(0, 0);
 * ```
 */
export function distance(a: Point, b: Point): number {
  return DMath.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Whether two rectangles overlap. Touching edges do not count.
 *
 * @example
 * ```ts
 * import { rectsOverlap } from '@blacklight/core';
 *
 * rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }); // true
 * ```
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Shortest signed difference between two angles in radians, in (-π, π]. Turning by this amount
 * goes the short way round.
 *
 * @example
 * ```ts
 * import { angleDelta, approach } from '@blacklight/core';
 *
 * // Turn the turret towards its target at 3 rad/s.
 * const delta = angleDelta(turret.rotation, targetAngle);
 * turret.rotation += approach(0, delta, 3 * dt);
 * ```
 */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** One degree in radians: `90 * DEG` is a quarter turn. */
export const DEG = Math.PI / 180;
