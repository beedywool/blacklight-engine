/** A navigation direction: four cardinal ones and four diagonals. */
export type Direction =
  'up' | 'down' | 'left' | 'right' | 'upleft' | 'upright' | 'downleft' | 'downright';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const VECTORS: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  upleft: [-Math.SQRT1_2, -Math.SQRT1_2],
  upright: [Math.SQRT1_2, -Math.SQRT1_2],
  downleft: [-Math.SQRT1_2, Math.SQRT1_2],
  downright: [Math.SQRT1_2, Math.SQRT1_2],
};

export function directionVector(direction: Direction): [number, number] {
  return VECTORS[direction];
}

/** Direction from horizontal and vertical input (−1, 0, 1), or `undefined` when centered. */
export function directionOf(x: number, y: number): Direction | undefined {
  const h = x < 0 ? 'left' : x > 0 ? 'right' : '';
  const v = y < 0 ? 'up' : y > 0 ? 'down' : '';
  return (v + h || undefined) as Direction | undefined;
}

function center(box: Box): [number, number] {
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** How far `b` extends past `a` on the axis perpendicular to a cardinal direction (0 when they overlap). */
function perpendicularGap(a: Box, b: Box, horizontal: boolean): number {
  const [a0, a1, b0, b1] = horizontal
    ? [a.y, a.y + a.height, b.y, b.y + b.height]
    : [a.x, a.x + a.width, b.x, b.x + b.width];
  return Math.max(0, b0 - a1, a0 - b1);
}

/**
 * The best candidate in a direction: in front of `from`, closest along the direction, with a
 * penalty for drifting sideways. Boxes aligned with `from` (overlapping on the cross axis) win
 * over closer but offset ones, which is what a gamepad user expects in a grid or a list.
 */
export function pickNext<T>(
  from: Box,
  candidates: { item: T; box: Box }[],
  direction: Direction,
): T | undefined {
  const [dx, dy] = directionVector(direction);
  const [fx, fy] = center(from);
  const cardinal = dx === 0 || dy === 0;
  let best: T | undefined;
  let bestScore = Infinity;
  for (const { item, box } of candidates) {
    const [cx, cy] = center(box);
    const vx = cx - fx;
    const vy = cy - fy;
    const along = vx * dx + vy * dy;
    if (along <= 1) continue;
    // A diagonal only reaches elements that are in both directions.
    if (!cardinal && (vx * dx <= 0 || vy * dy <= 0)) continue;
    let across = Math.abs(vx * dy - vy * dx);
    if (cardinal) {
      // Edges, not centers: a wide button straight below counts as aligned.
      const gap = perpendicularGap(from, box, dx !== 0);
      if (gap === 0) across = 0;
      else across = gap + across * 0.25;
      // Must actually be beyond `from`'s edge, not just its center.
      const edge =
        dx > 0
          ? box.x >= from.x + from.width - 1
          : dx < 0
            ? box.x + box.width <= from.x + 1
            : dy > 0
              ? box.y >= from.y + from.height - 1
              : box.y + box.height <= from.y + 1;
      if (!edge && across > 0) continue;
    }
    const score = along + across * (cardinal ? 3 : 1.5);
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/** Target when wrapping around: the farthest candidate the other way, best aligned with `from`. */
export function wrapTarget<T>(
  from: Box,
  candidates: { item: T; box: Box }[],
  direction: Direction,
): T | undefined {
  const [dx, dy] = directionVector(direction);
  const [fx, fy] = center(from);
  let best: T | undefined;
  let bestScore = Infinity;
  for (const { item, box } of candidates) {
    const [cx, cy] = center(box);
    const along = (cx - fx) * dx + (cy - fy) * dy;
    const across = Math.abs((cx - fx) * dy - (cy - fy) * dx);
    // Most negative `along` (far behind) first, aligned ones preferred.
    const score = along + across * 3;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}
