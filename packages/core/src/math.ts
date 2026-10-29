/** A mutable 2D vector. Speeds in the engine are in virtual pixels per second. */
export class Vector2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  /** Euclidean length. */
  get length(): number {
    return Math.hypot(this.x, this.y);
  }

  /** Angle in radians, 0 pointing right, growing clockwise (screen coordinates). */
  get angle(): number {
    return Math.atan2(this.y, this.x);
  }

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(other: { x: number; y: number }): this {
    return this.set(other.x, other.y);
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  add(other: { x: number; y: number }): this {
    return this.set(this.x + other.x, this.y + other.y);
  }

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

  equals(other: { x: number; y: number }): boolean {
    return this.x === other.x && this.y === other.y;
  }

  toJSON(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Moves `from` towards `to` by at most `step`. */
export function approach(from: number, to: number, step: number): number {
  return from < to ? Math.min(from + step, to) : Math.max(from - step, to);
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Shortest signed difference between two angles in radians, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

export const DEG = Math.PI / 180;
