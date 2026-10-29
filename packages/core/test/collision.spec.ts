import { describe, expect, it } from 'vitest';
import { collide, rayShape, toWorld, maskFromRgba, type WorldShape } from '../src/collision/shapes';
import { SpatialHash } from '../src/collision/spatial-hash';

const box = (x: number, y: number, w: number, h: number): WorldShape => ({
  kind: 'box',
  rect: { x, y, width: w, height: h },
});

describe('collide', () => {
  it('boxes', () => {
    expect(collide(box(0, 0, 10, 10), box(20, 0, 10, 10))).toBeUndefined();
    expect(collide(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBeUndefined();
    expect(collide(box(0, 0, 10, 10), box(8, 0, 10, 10))).toEqual({ nx: -1, ny: 0, depth: 2 });
  });

  it('circles and polygons', () => {
    const circle: WorldShape = { kind: 'circle', x: 0, y: 0, radius: 5 };
    expect(collide(circle, { kind: 'circle', x: 8, y: 0, radius: 5 })!.depth).toBeCloseTo(2);
    expect(collide(circle, box(4, -2, 10, 4))!.nx).toBeCloseTo(-1);
    const triangle: WorldShape = {
      kind: 'polygon',
      points: [
        { x: 0, y: 10 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
    };
    expect(collide(box(0, 0, 3, 3), triangle)).toBeUndefined();
    expect(collide(box(7, 7, 2, 2), triangle)).toBeDefined();
  });

  it('pixel masks', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    rgba[(0 * 4 + 0) * 4 + 3] = 255; // only the top-left pixel is opaque
    const mask = maskFromRgba(rgba, 4, 4);
    const pixel = toWorld(
      { type: 'pixel', rect: { x: 0, y: 0, width: 4, height: 4 }, mask },
      { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    );
    expect(collide(pixel, box(2, 2, 2, 2))).toBeUndefined();
    expect(collide(pixel, box(0, 0, 1, 1))).toBeDefined();
    const flipped = toWorld(
      { type: 'pixel', rect: { x: 0, y: 0, width: 4, height: 4 }, mask, flipX: true },
      { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    );
    expect(collide(flipped, box(3, 0, 1, 1))).toBeDefined();
  });

  it('transforms local shapes', () => {
    const rotated = toWorld(
      { type: 'box', x: -5, y: -5, width: 10, height: 10 },
      { x: 100, y: 0, rotation: Math.PI / 4, scaleX: 2, scaleY: 2 },
    );
    expect(rotated.kind).toBe('polygon');
    expect(
      toWorld(
        { type: 'box', width: 10, height: 10 },
        { x: 5, y: 5, rotation: 0, scaleX: -1, scaleY: 1 },
      ),
    ).toEqual(box(-5, 5, 10, 10));
  });

  it('raycasts', () => {
    expect(rayShape(0, 5, 1, 0, 100, box(50, 0, 10, 10))).toBeCloseTo(50);
    expect(rayShape(0, 50, 1, 0, 100, box(50, 0, 10, 10))).toBeUndefined();
    expect(rayShape(0, 0, 1, 0, 100, { kind: 'circle', x: 30, y: 0, radius: 5 })).toBeCloseTo(25);
  });
});

describe('SpatialHash', () => {
  it('pairs only nearby items, once', () => {
    const hash = new SpatialHash<string>(10);
    hash.insert('a', { x: 0, y: 0, width: 15, height: 5 });
    hash.insert('b', { x: 12, y: 0, width: 5, height: 5 });
    hash.insert('c', { x: 100, y: 100, width: 5, height: 5 });
    const pairs: string[] = [];
    hash.pairs((a, b) => pairs.push([a, b].sort().join('')));
    expect(pairs).toEqual(['ab']);
    expect([...hash.query({ x: 95, y: 95, width: 10, height: 10 })]).toEqual(['c']);
  });
});
