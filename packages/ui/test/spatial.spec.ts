import { describe, expect, it } from 'vitest';
import { directionOf, pickNext, wrapTarget } from '../src/spatial';

const box = (x: number, y: number, width = 100, height = 40) => ({ x, y, width, height });
const items = (boxes: Record<string, ReturnType<typeof box>>) =>
  Object.entries(boxes).map(([item, b]) => ({ item, box: b }));

describe('pickNext', () => {
  it('moves down a list and prefers aligned items', () => {
    const list = items({ a: box(0, 0), b: box(0, 50), c: box(300, 45) });
    expect(pickNext(box(0, 0), list.slice(1), 'down')).toBe('b');
    expect(pickNext(box(0, 50), items({ a: box(0, 0) }), 'down')).toBeUndefined();
  });

  it('picks the nearest column in a grid, and diagonals', () => {
    const grid = items({ r: box(110, 0), far: box(330, 0), dr: box(110, 50), d: box(0, 50) });
    expect(pickNext(box(0, 0), grid, 'right')).toBe('r');
    expect(pickNext(box(0, 0), grid, 'downright')).toBe('dr');
  });

  it('a wide element straight below beats a closer offset one', () => {
    expect(
      pickNext(
        box(400, 0),
        items({ wide: box(0, 120, 1000, 40), side: box(560, 50, 50, 40) }),
        'down',
      ),
    ).toBe('wide');
  });

  it('wraps to the far end', () => {
    expect(wrapTarget(box(0, 100), items({ a: box(0, 0), b: box(0, 50) }), 'down')).toBe('a');
  });

  it('turns axes into directions', () => {
    expect(directionOf(1, 0)).toBe('right');
    expect(directionOf(-1, -1)).toBe('upleft');
    expect(directionOf(0, 0)).toBeUndefined();
  });
});
