import { DMath } from '../dmath';
import type { Point, Rect } from '../math';

/**
 * Collision shape of an object, in its local space (0, 0 is the object's position).
 *
 * - `'auto'`: the current frame's rectangle (sprites) or the object's bounds.
 * - `'none'`: no collisions.
 * - `'pixel'`: opaque pixels of the current frame (sprites; translation and flips only).
 */
export type HitboxSpec =
  | 'auto'
  | 'none'
  | 'pixel'
  | {
      /** An axis-aligned rectangle (it turns with the object). */
      type: 'box';
      /** Left edge relative to the object's position. @defaultValue `0` */
      x?: number;
      /** Top edge relative to the object's position. @defaultValue `0` */
      y?: number;
      /** Width in virtual pixels. */
      width: number;
      /** Height in virtual pixels. */
      height: number;
    }
  | {
      /** A circle; scaling uses the larger of the two scale factors. */
      type: 'circle';
      /** Center relative to the object's position. @defaultValue `0` */
      x?: number;
      /** Center relative to the object's position. @defaultValue `0` */
      y?: number;
      /** Radius in virtual pixels. */
      radius: number;
    }
  | {
      /** A convex polygon. */
      type: 'polygon';
      /** Corners as `[x, y]` pairs relative to the object's position, in order. */
      points: [number, number][];
    };

/**
 * A collision shape placed in scene coordinates, as returned by `GameObject.worldShape()` and
 * tested by {@link collide}.
 */
export type WorldShape =
  | {
      /** An axis-aligned rectangle (a box hitbox of an object without rotation). */
      kind: 'box';
      /** The rectangle in scene coordinates. */
      rect: Rect;
    }
  | {
      /** A circle. */
      kind: 'circle';
      /** Center in scene coordinates. */
      x: number;
      /** Center in scene coordinates. */
      y: number;
      /** Radius in virtual pixels, after scaling. */
      radius: number;
    }
  | {
      /** A convex polygon (also a rotated box). */
      kind: 'polygon';
      /** Corners in scene coordinates, in order. */
      points: Point[];
    }
  | {
      /** Opaque pixels of a sprite frame. */
      kind: 'pixel';
      /** Area the mask covers in scene coordinates. */
      rect: Rect;
      /** Which pixels are solid. */
      mask: PixelMask;
      /** Whether the mask is mirrored horizontally. */
      flipX: boolean;
      /** Whether the mask is mirrored vertically. */
      flipY: boolean;
    };

/** Opaque pixels of a frame, one byte per pixel. */
export interface PixelMask {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** `width × height` bytes, row by row from the top left: 1 for solid, 0 for empty. */
  data: Uint8Array;
}

/** Pixel hitbox in local space; `flipX` / `flipY` mirror the mask (mirrored sprite frames). */
export interface LocalPixelShape {
  /** A pixel hitbox. */
  type: 'pixel';
  /** Area the mask covers, relative to the object's position. */
  rect: Rect;
  /** Which pixels are solid. */
  mask: PixelMask;
  /** Whether the mask is mirrored horizontally. */
  flipX?: boolean;
  /** Whether the mask is mirrored vertically. */
  flipY?: boolean;
}

/** 2D transform without skew: translate · rotate · scale. */
export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export function applyTransform(t: Transform, px: number, py: number): Point {
  const sx = px * t.scaleX;
  const sy = py * t.scaleY;
  if (t.rotation === 0) return { x: t.x + sx, y: t.y + sy };
  const cos = DMath.cos(t.rotation);
  const sin = DMath.sin(t.rotation);
  return { x: t.x + sx * cos - sy * sin, y: t.y + sx * sin + sy * cos };
}

/** Places a local shape in the scene. `mask` is required for `'pixel'`. */
export function toWorld(
  local: Exclude<HitboxSpec, 'auto' | 'none' | 'pixel'> | LocalPixelShape,
  t: Transform,
): WorldShape {
  if (local.type === 'circle') {
    const center = applyTransform(t, local.x ?? 0, local.y ?? 0);
    return {
      kind: 'circle',
      ...center,
      radius: local.radius * Math.max(Math.abs(t.scaleX), Math.abs(t.scaleY)),
    };
  }
  if (local.type === 'pixel') {
    const a = applyTransform({ ...t, rotation: 0 }, local.rect.x, local.rect.y);
    const b = applyTransform(
      { ...t, rotation: 0 },
      local.rect.x + local.rect.width,
      local.rect.y + local.rect.height,
    );
    return {
      kind: 'pixel',
      rect: {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      },
      mask: local.mask,
      flipX: t.scaleX < 0 !== !!local.flipX,
      flipY: t.scaleY < 0 !== !!local.flipY,
    };
  }
  const points: [number, number][] =
    local.type === 'box'
      ? [
          [local.x ?? 0, local.y ?? 0],
          [(local.x ?? 0) + local.width, local.y ?? 0],
          [(local.x ?? 0) + local.width, (local.y ?? 0) + local.height],
          [local.x ?? 0, (local.y ?? 0) + local.height],
        ]
      : local.points;
  const world = points.map(([x, y]) => applyTransform(t, x, y));
  if (local.type === 'box' && t.rotation === 0) return { kind: 'box', rect: boundsOfPoints(world) };
  return { kind: 'polygon', points: world };
}

function boundsOfPoints(points: Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Axis-aligned bounds of a world shape: a quick rectangle for culling, spatial queries or drawing
 * a debug outline.
 *
 * @example
 * ```ts
 * import { shapeBounds } from '@blacklight/core';
 *
 * const shape = enemy.worldShape();
 * // Lowest point of the enemy, whatever its hitbox.
 * const bottom = shape ? shapeBounds(shape).y + shapeBounds(shape).height : enemy.y;
 * ```
 */
export function shapeBounds(shape: WorldShape): Rect {
  switch (shape.kind) {
    case 'box':
    case 'pixel':
      return shape.rect;
    case 'circle':
      return {
        x: shape.x - shape.radius,
        y: shape.y - shape.radius,
        width: shape.radius * 2,
        height: shape.radius * 2,
      };
    case 'polygon':
      return boundsOfPoints(shape.points);
  }
}

export function translateShape(shape: WorldShape, dx: number, dy: number): WorldShape {
  switch (shape.kind) {
    case 'box':
    case 'pixel':
      return { ...shape, rect: { ...shape.rect, x: shape.rect.x + dx, y: shape.rect.y + dy } };
    case 'circle':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'polygon':
      return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
}

/** Minimum translation that pushes the first shape out of the second. */
export interface Penetration {
  /** Unit normal pointing from the second shape towards the first. */
  nx: number;
  /** Vertical part of the unit normal (`-1` pushes `a` up). */
  ny: number;
  /** How far to move `a` along the normal so the shapes stop overlapping, in virtual pixels. */
  depth: number;
}

function rectPoints(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

function asPolygon(shape: WorldShape): Point[] | undefined {
  if (shape.kind === 'box' || shape.kind === 'pixel') return rectPoints(shape.rect);
  if (shape.kind === 'polygon') return shape.points;
  return undefined;
}

function project(points: Point[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const d = p.x * ax + p.y * ay;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

function centroid(points: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function polygonPolygon(a: Point[], b: Point[]): Penetration | undefined {
  let best: Penetration | undefined;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      let nx = -(q.y - p.y);
      let ny = q.x - p.x;
      const length = DMath.hypot(nx, ny);
      if (length === 0) continue;
      nx /= length;
      ny /= length;
      const [minA, maxA] = project(a, nx, ny);
      const [minB, maxB] = project(b, nx, ny);
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return undefined;
      if (!best || overlap < best.depth) best = { nx, ny, depth: overlap };
    }
  }
  if (!best) return undefined;
  const ca = centroid(a);
  const cb = centroid(b);
  if ((ca.x - cb.x) * best.nx + (ca.y - cb.y) * best.ny < 0) {
    best.nx = -best.nx;
    best.ny = -best.ny;
  }
  return best;
}

function circleCircle(
  a: { x: number; y: number; radius: number },
  b: { x: number; y: number; radius: number },
): Penetration | undefined {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = DMath.hypot(dx, dy);
  const depth = a.radius + b.radius - dist;
  if (depth <= 0) return undefined;
  return dist === 0 ? { nx: 0, ny: -1, depth } : { nx: dx / dist, ny: dy / dist, depth };
}

function circlePolygon(
  c: { x: number; y: number; radius: number },
  poly: Point[],
): Penetration | undefined {
  // Axes: polygon edge normals plus the axis from the closest vertex to the circle center.
  let closest = poly[0]!;
  let closestDist = Infinity;
  for (const p of poly) {
    const d = (p.x - c.x) * (p.x - c.x) + (p.y - c.y) * (p.y - c.y);
    if (d < closestDist) {
      closestDist = d;
      closest = p;
    }
  }
  const axes: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    axes.push([-(q.y - p.y), q.x - p.x]);
  }
  axes.push([c.x - closest.x, c.y - closest.y]);
  let best: Penetration | undefined;
  for (const [ax, ay] of axes) {
    const length = DMath.hypot(ax, ay);
    if (length === 0) continue;
    const nx = ax / length;
    const ny = ay / length;
    const [minP, maxP] = project(poly, nx, ny);
    const center = c.x * nx + c.y * ny;
    const overlap = Math.min(maxP, center + c.radius) - Math.max(minP, center - c.radius);
    if (overlap <= 0) return undefined;
    if (!best || overlap < best.depth) best = { nx, ny, depth: overlap };
  }
  if (!best) return undefined;
  const cp = centroid(poly);
  if ((c.x - cp.x) * best.nx + (c.y - cp.y) * best.ny < 0) {
    best.nx = -best.nx;
    best.ny = -best.ny;
  }
  return best;
}

function maskAt(shape: Extract<WorldShape, { kind: 'pixel' }>, wx: number, wy: number): boolean {
  const { rect, mask } = shape;
  let u = Math.floor(((wx - rect.x) / rect.width) * mask.width);
  let v = Math.floor(((wy - rect.y) / rect.height) * mask.height);
  if (u < 0 || v < 0 || u >= mask.width || v >= mask.height) return false;
  if (shape.flipX) u = mask.width - 1 - u;
  if (shape.flipY) v = mask.height - 1 - v;
  return mask.data[v * mask.width + u]! > 0;
}

function pointInShape(shape: WorldShape, x: number, y: number): boolean {
  switch (shape.kind) {
    case 'box':
      return (
        x >= shape.rect.x &&
        x < shape.rect.x + shape.rect.width &&
        y >= shape.rect.y &&
        y < shape.rect.y + shape.rect.height
      );
    case 'circle':
      return (
        (x - shape.x) * (x - shape.x) + (y - shape.y) * (y - shape.y) <= shape.radius * shape.radius
      );
    case 'pixel':
      return maskAt(shape, x, y);
    case 'polygon': {
      let inside = false;
      const pts = shape.points;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const pi = pts[i]!;
        const pj = pts[j]!;
        if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x)
          inside = !inside;
      }
      return inside;
    }
  }
}

function pixelTest(a: WorldShape, b: WorldShape): Penetration | undefined {
  const ra = shapeBounds(a);
  const rb = shapeBounds(b);
  const x0 = Math.max(ra.x, rb.x);
  const y0 = Math.max(ra.y, rb.y);
  const x1 = Math.min(ra.x + ra.width, rb.x + rb.width);
  const y1 = Math.min(ra.y + ra.height, rb.y + rb.height);
  if (x1 <= x0 || y1 <= y0) return undefined;
  for (let y = Math.floor(y0) + 0.5; y < y1; y++) {
    for (let x = Math.floor(x0) + 0.5; x < x1; x++) {
      if (pointInShape(a, x, y) && pointInShape(b, x, y)) {
        // Pixel contacts report the overlap rectangle's smallest side as depth.
        const ca = { x: ra.x + ra.width / 2, y: ra.y + ra.height / 2 };
        const cb = { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 };
        return x1 - x0 < y1 - y0
          ? { nx: ca.x < cb.x ? -1 : 1, ny: 0, depth: x1 - x0 }
          : { nx: 0, ny: ca.y < cb.y ? -1 : 1, depth: y1 - y0 };
      }
    }
  }
  return undefined;
}

/**
 * Tests two shapes. Returns how to push `a` out of `b`, or `undefined` when they do not overlap.
 * Touching edges do not count as overlapping. Objects already do this through `overlaps()` and
 * `onCollide`; call it for shapes of your own (an attack area, a trigger zone).
 *
 * @example
 * ```ts
 * import { collide } from '@blacklight/core';
 *
 * const area = { kind: 'circle' as const, x: player.x, y: player.y, radius: 48 };
 * const target = enemy.worldShape();
 * if (target && collide(area, target)) enemy.destroy();
 * ```
 */
export function collide(a: WorldShape, b: WorldShape): Penetration | undefined {
  if (a.kind === 'pixel' || b.kind === 'pixel') return pixelTest(a, b);
  if (a.kind === 'box' && b.kind === 'box') {
    const ra = a.rect;
    const rb = b.rect;
    const overlapX = Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x);
    const overlapY = Math.min(ra.y + ra.height, rb.y + rb.height) - Math.max(ra.y, rb.y);
    if (overlapX <= 0 || overlapY <= 0) return undefined;
    if (overlapX < overlapY)
      return { nx: ra.x + ra.width / 2 < rb.x + rb.width / 2 ? -1 : 1, ny: 0, depth: overlapX };
    return { nx: 0, ny: ra.y + ra.height / 2 < rb.y + rb.height / 2 ? -1 : 1, depth: overlapY };
  }
  if (a.kind === 'circle' && b.kind === 'circle') return circleCircle(a, b);
  if (a.kind === 'circle') return circlePolygon(a, asPolygon(b)!);
  if (b.kind === 'circle') {
    const p = circlePolygon(b, asPolygon(a)!);
    return p && { nx: -p.nx, ny: -p.ny, depth: p.depth };
  }
  return polygonPolygon(asPolygon(a)!, asPolygon(b)!);
}

/** Distance along a ray to the first intersection with `shape`, or `undefined`. */
export function rayShape(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDistance: number,
  shape: WorldShape,
): number | undefined {
  if (shape.kind === 'circle') {
    const fx = ox - shape.x;
    const fy = oy - shape.y;
    const b = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - shape.radius * shape.radius;
    if (c <= 0) return 0;
    const disc = b * b - c;
    if (disc < 0) return undefined;
    const t = -b - Math.sqrt(disc);
    return t >= 0 && t <= maxDistance ? t : undefined;
  }
  if (shape.kind === 'pixel') {
    for (let t = 0; t <= maxDistance; t += 1) if (maskAt(shape, ox + dx * t, oy + dy * t)) return t;
    return undefined;
  }
  const points = asPolygon(shape)!;
  if (pointInShape(shape, ox, oy)) return 0;
  let best: number | undefined;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const denom = dx * ey - dy * ex;
    if (denom === 0) continue;
    const t = ((p.x - ox) * ey - (p.y - oy) * ex) / denom;
    const u = ((p.x - ox) * dy - (p.y - oy) * dx) / denom;
    if (t >= 0 && t <= maxDistance && u >= 0 && u <= 1 && (best === undefined || t < best))
      best = t;
  }
  return best;
}

/** Builds a pixel mask from RGBA data: a pixel is solid when its alpha is above `threshold`. */
export function maskFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 127,
): PixelMask {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3]! > threshold ? 1 : 0;
  return { width, height, data };
}
