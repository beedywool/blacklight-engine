import { DMath } from '../dmath';
import type { GameObject } from '../objects/game-object';
import type { ActionName } from '../register';
import { Behavior } from './behavior';

export interface Cell {
  column: number;
  row: number;
}

/**
 * A* on a grid. Returns the cells from `start` (excluded) to `goal` (included), or `undefined`
 * when there is no path within `maxNodes` explored cells.
 */
export function findPath(
  start: Cell,
  goal: Cell,
  blocked: (column: number, row: number) => boolean,
  options: { diagonal?: boolean; maxNodes?: number } = {},
): Cell[] | undefined {
  const key = (c: number, r: number) => `${c},${r}`;
  const steps = options.diagonal
    ? [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]
    : [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
  const heuristic = (c: number, r: number) => {
    const dx = Math.abs(c - goal.column);
    const dy = Math.abs(r - goal.row);
    return options.diagonal ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
  };
  const open = new Map<string, { column: number; row: number; g: number; f: number }>();
  const came = new Map<string, string>();
  const cost = new Map<string, number>();
  const startKey = key(start.column, start.row);
  open.set(startKey, { ...start, g: 0, f: heuristic(start.column, start.row) });
  cost.set(startKey, 0);
  const maxNodes = options.maxNodes ?? 5000;
  let explored = 0;
  while (open.size > 0 && explored++ < maxNodes) {
    let currentKey = '';
    let current: { column: number; row: number; g: number; f: number } | undefined;
    for (const [k, node] of open)
      if (!current || node.f < current.f) [currentKey, current] = [k, node];
    open.delete(currentKey);
    if (current!.column === goal.column && current!.row === goal.row) {
      const path: Cell[] = [];
      for (let k: string | undefined = currentKey; k && k !== startKey; k = came.get(k)) {
        const [c, r] = k.split(',').map(Number) as [number, number];
        path.unshift({ column: c, row: r });
      }
      return path;
    }
    for (const [dc, dr] of steps as [number, number][]) {
      const c = current!.column + dc;
      const r = current!.row + dr;
      if (blocked(c, r)) continue;
      if (
        dc !== 0 &&
        dr !== 0 &&
        (blocked(current!.column + dc, current!.row) || blocked(current!.column, current!.row + dr))
      )
        continue;
      const k = key(c, r);
      const g = current!.g + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1);
      if (g >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, g);
      came.set(k, currentKey);
      open.set(k, { column: c, row: r, g, f: g + heuristic(c, r) });
    }
  }
  return undefined;
}

export interface GridOptions {
  /** Cell size in px. */
  cellSize: number;
  /** Cells per second. @defaultValue `6` */
  speed?: number;
  /** Allow diagonal steps for `moveTo`. */
  diagonal?: boolean;
  actions?: { left?: ActionName; right?: ActionName; up?: ActionName; down?: ActionName };
  /** Read input; turn off for objects driven only by `moveTo`. @defaultValue `true` */
  controlled?: boolean;
}

/**
 * Moves cell by cell (puzzle games, tactics, roguelikes). Cells blocked by solids are skipped;
 * `moveTo` finds a path with A*.
 */
export class GridMovement extends Behavior<GridOptions> {
  readonly name = 'gridMovement';
  override readonly ownsMovement = true;
  /** Cells still to walk. */
  path: Cell[] = [];
  private target: { x: number; y: number } | undefined;

  /** Cell the object is in (or heading to). */
  get cell(): Cell {
    const size = this.options.cellSize;
    const at = this.target ?? this.object;
    return { column: Math.floor(at.x / size), row: Math.floor(at.y / size) };
  }

  get moving(): boolean {
    return this.target !== undefined || this.path.length > 0;
  }

  /** `true` when a solid occupies the cell. */
  isBlocked(column: number, row: number): boolean {
    const size = this.options.cellSize;
    const here = this.object;
    const dx = (column + 0.5) * size - here.x;
    const dy = (row + 0.5) * size - here.y;
    return here.scene.collisions.blockedAt(here, dx, dy);
  }

  /** Walks to a cell along the shortest free path. Returns `false` when unreachable. */
  moveTo(column: number, row: number): boolean {
    const path = findPath(this.cell, { column, row }, (c, r) => this.isBlocked(c, r), {
      diagonal: this.options.diagonal,
    });
    if (!path) return false;
    this.path = path;
    return true;
  }

  override update(object: GameObject, dt: number): void {
    const size = this.options.cellSize;
    if (!this.target) {
      let next = this.path.shift();
      if (!next && this.options.controlled !== false) {
        const a = this.options.actions ?? {};
        const input = object.input;
        const dx = input.held(a.left ?? 'left') ? -1 : input.held(a.right ?? 'right') ? 1 : 0;
        const dy =
          dx !== 0 ? 0 : input.held(a.up ?? 'up') ? -1 : input.held(a.down ?? 'down') ? 1 : 0;
        if (dx !== 0 || dy !== 0) {
          const c = this.cell;
          next = { column: c.column + dx, row: c.row + dy };
        }
      }
      if (next && !this.isBlocked(next.column, next.row)) {
        this.target = { x: (next.column + 0.5) * size, y: (next.row + 0.5) * size };
      } else if (next) {
        this.path = [];
      }
    }
    if (!this.target) {
      object.velocity.set(0, 0);
      return;
    }
    const speed = (this.options.speed ?? 6) * size;
    const dx = this.target.x - object.x;
    const dy = this.target.y - object.y;
    const distance = DMath.hypot(dx, dy);
    const step = speed * dt;
    if (distance <= step) {
      object.x = this.target.x;
      object.y = this.target.y;
      this.target = undefined;
    } else {
      object.x += (dx / distance) * step;
      object.y += (dy / distance) * step;
    }
    object.velocity.set(
      distance > 0 ? (dx / distance) * speed : 0,
      distance > 0 ? (dy / distance) * speed : 0,
    );
  }
}
