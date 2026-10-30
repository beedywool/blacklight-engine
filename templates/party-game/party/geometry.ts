// @blacklight-deterministic
// Small geometry for the mini-games. Only additions, multiplications, divisions and `Math.sqrt`
// (exact in IEEE 754), so every machine of an online match gets the same bits.
import type { Rect } from '@blacklight/core';

/** 1 / √2: diagonal moves are as fast as straight ones. */
export const DIAGONAL = 0.7071067811865476;

export function length(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Direction from the four direction actions of a player (length 0 or 1, diagonals included). */
export function direction(input: {
  axis(negative: 'left' | 'up', positive: 'right' | 'down'): number;
}): { x: number; y: number } {
  let x = input.axis('left', 'right');
  let y = input.axis('up', 'down');
  const size = length(x, y);
  if (size > 1) {
    x /= size;
    y /= size;
  }
  return { x, y };
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Push-out vector of a circle overlapping a rectangle, or `undefined` when they do not touch. */
export function circleRect(
  x: number,
  y: number,
  radius: number,
  rect: Rect,
): { x: number; y: number; nx: number; ny: number } | undefined {
  const cx = clamp(x, rect.x, rect.x + rect.width);
  const cy = clamp(y, rect.y, rect.y + rect.height);
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return undefined;
  if (d2 > 0) {
    const d = Math.sqrt(d2);
    const depth = radius - d;
    return { x: (dx / d) * depth, y: (dy / d) * depth, nx: dx / d, ny: dy / d };
  }
  // Center inside the rectangle: leave by the nearest side.
  const left = x - rect.x;
  const right = rect.x + rect.width - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.height - y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { x: -(left + radius), y: 0, nx: -1, ny: 0 };
  if (min === right) return { x: right + radius, y: 0, nx: 1, ny: 0 };
  if (min === top) return { x: 0, y: -(top + radius), nx: 0, ny: -1 };
  return { x: 0, y: bottom + radius, nx: 0, ny: 1 };
}

/** `true` when a point is inside a rectangle. */
export function inside(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** Reflects a velocity on a surface of normal (nx, ny) when it moves into it. */
export function reflect(vx: number, vy: number, nx: number, ny: number): { x: number; y: number } {
  const dot = vx * nx + vy * ny;
  if (dot >= 0) return { x: vx, y: vy };
  return { x: vx - 2 * dot * nx, y: vy - 2 * dot * ny };
}
