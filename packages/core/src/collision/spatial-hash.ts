import type { Rect } from '../math';

/**
 * Uniform grid broadphase: items are bucketed by the cells their bounds cover, so only items
 * sharing a cell are tested against each other.
 */
export class SpatialHash<T> {
  private readonly cells = new Map<number, T[]>();

  constructor(readonly cellSize = 128) {}

  clear(): void {
    this.cells.clear();
  }

  insert(item: T, bounds: Rect): void {
    this.forCells(bounds, (key) => {
      const cell = this.cells.get(key);
      if (cell) cell.push(item);
      else this.cells.set(key, [item]);
    });
  }

  /** Items whose cells intersect `bounds` (each once). */
  query(bounds: Rect, out = new Set<T>()): Set<T> {
    this.forCells(bounds, (key) => {
      for (const item of this.cells.get(key) ?? []) out.add(item);
    });
    return out;
  }

  /** Calls `visit` once for every pair of items sharing at least one cell. */
  pairs(visit: (a: T, b: T) => void): void {
    const seen = new Set<string>();
    const ids = new Map<T, number>();
    let next = 0;
    const id = (item: T) => {
      let value = ids.get(item);
      if (value === undefined) ids.set(item, (value = next++));
      return value;
    };
    for (const cell of this.cells.values()) {
      for (let i = 0; i < cell.length; i++) {
        for (let j = i + 1; j < cell.length; j++) {
          const a = cell[i]!;
          const b = cell[j]!;
          if (a === b) continue;
          const ia = id(a);
          const ib = id(b);
          const key = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
          if (seen.has(key)) continue;
          seen.add(key);
          visit(a, b);
        }
      }
    }
  }

  private forCells(bounds: Rect, visit: (key: number) => void): void {
    const size = this.cellSize;
    const x0 = Math.floor(bounds.x / size);
    const y0 = Math.floor(bounds.y / size);
    const x1 = Math.floor((bounds.x + Math.max(bounds.width, 0)) / size);
    const y1 = Math.floor((bounds.y + Math.max(bounds.height, 0)) / size);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) visit(((cx + 32768) << 16) ^ (cy + 32768));
    }
  }
}
