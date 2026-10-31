import { DMath } from '../dmath';
import type { GameObject } from '../objects/game-object';
import type { Point, Rect } from '../math';
import {
  collide,
  rayShape,
  shapeBounds,
  translateShape,
  type Penetration,
  type WorldShape,
} from './shapes';
import { SpatialHash } from './spatial-hash';

/** How an object takes part in collisions (`static collision` on the class). */
export interface CollisionSpec {
  /** Collision layer name. @defaultValue `'default'` */
  layer?: string;
  /** Layers this object reports collisions with. @defaultValue every layer */
  mask?: string[];
  /** Blocks objects moving with `move()` or `velocity` whose mask includes this layer. */
  solid?: boolean;
  /**
   * Report `onCollide` / `onCollideEnd` from hitbox overlaps. @defaultValue `true` (physics bodies
   * turn it off: Rapier reports their contacts).
   */
  events?: boolean;
  /** Solid from above only: one-way platforms. */
  jumpThru?: boolean;
  /** Stops at solids when moving. @defaultValue `true` */
  blockedBySolids?: boolean;
}

/**
 * A static source of solid shapes, such as a tilemap layer. Add one to
 * {@link CollisionWorld.providers} to block moving objects with shapes that are not game objects.
 */
export interface SolidProvider {
  /** Solid shapes overlapping `bounds` (scene coordinates); called for every blocked move. */
  solidShapes(bounds: Rect): {
    /** The solid shape in scene coordinates. */
    shape: WorldShape;
    /** Solid from above only (one-way platform). */
    jumpThru: boolean;
  }[];
}

/** One overlap between two objects, passed to `onCollide`. */
export interface Contact {
  /** The object this one overlaps. */
  other: GameObject;
  /** How to push this object out of the other. */
  penetration: Penetration;
}

/** What `scene.raycast()` hit first. */
export interface RaycastHit {
  /** The object hit, or `undefined` for a tilemap solid. */
  object: GameObject | undefined;
  /** Where the segment enters the shape, in scene coordinates. */
  point: Point;
  /** Distance from the start of the segment to `point`, in virtual pixels. */
  distance: number;
}

/** Result of `GameObject.move()`: which axes were blocked and by what. */
export interface MoveResult {
  /** Horizontal movement was stopped by a solid. */
  blockedX: boolean;
  /** Vertical movement was stopped by a solid (landing, hitting a ceiling). */
  blockedY: boolean;
  /** Solid objects touched (tilemaps are not listed). */
  touched: GameObject[];
}

/** A side of the scene bounds or of a shape, as passed to `onLeave`. */
export type Side = 'left' | 'right' | 'top' | 'bottom';

/** Contacts and outside states by object id, from {@link CollisionWorld.capture}. */
export interface CollisionState {
  /** Ongoing overlaps as `[object id, other id, penetration]`. */
  readonly contacts: readonly (readonly [number, number, Penetration])[];
  /** Objects fully outside the scene bounds, as `[object id, side]`. */
  readonly outside: readonly (readonly [number, Side])[];
}

/**
 * Collision detection for one scene: overlap events, solid movement, queries and raycasts. Each
 * scene owns one as `scene.collisions`; games mostly use it through `GameObject.move()`,
 * `onCollide`, `scene.query()` and `scene.raycast()`.
 *
 * @example
 * ```ts
 * // Inside a scene: everything an explosion at (x, y) touches.
 * const hit = this.collisions.query({ kind: 'circle', x, y, radius: 64 }, (o) => o.is('enemy'));
 * for (const enemy of hit) enemy.destroy();
 * ```
 */
export class CollisionWorld {
  private readonly layerBits = new Map<string, number>([['default', 1]]);
  private readonly hash = new SpatialHash<GameObject>(128);
  private readonly contacts = new Map<GameObject, Map<GameObject, Penetration>>();
  private readonly outside = new Map<GameObject, Side>();
  /** Static solids that are not game objects (tilemap layers add themselves). */
  readonly providers = new Set<SolidProvider>();

  constructor(private readonly objects: () => Iterable<GameObject>) {}

  /** Bit of a named layer, allocated on first use (up to 31 layers). */
  layerBit(name: string): number {
    let bit = this.layerBits.get(name);
    if (bit === undefined) {
      if (this.layerBits.size >= 31)
        throw new Error(`Too many collision layers (31 max); "${name}" is one too many.`);
      bit = 1 << this.layerBits.size;
      this.layerBits.set(name, bit);
    }
    return bit;
  }

  private maskBits(object: GameObject): number {
    const mask = object.collision.mask;
    if (!mask) return ~0;
    let bits = 0;
    for (const name of mask) bits |= this.layerBit(name);
    return bits;
  }

  /** `a` reports collisions with `b`: `b`'s layer is in `a`'s mask. */
  private listens(a: GameObject, b: GameObject): boolean {
    return (this.maskBits(a) & this.layerBit(b.collision.layer ?? 'default')) !== 0;
  }

  private interacts(a: GameObject, b: GameObject): boolean {
    return this.listens(a, b) || this.listens(b, a);
  }

  /**
   * Detects overlaps, then calls `onCollide` for new contacts, `onCollideEnd` for ended ones and
   * `onLeave` for objects that went fully outside `bounds`.
   */
  step(bounds: Rect): void {
    this.hash.clear();
    const bodies: GameObject[] = [];
    for (const object of this.objects()) {
      if (!object.alive) continue;
      const shape = object.worldShape();
      if (!shape) continue;
      bodies.push(object);
      this.hash.insert(object, shapeBounds(shape));
    }

    const current = new Map<GameObject, Map<GameObject, Penetration>>();
    const add = (a: GameObject, b: GameObject, p: Penetration) => {
      let map = current.get(a);
      if (!map) current.set(a, (map = new Map()));
      map.set(b, p);
    };
    this.hash.pairs((a, b) => {
      if (!this.interacts(a, b) || a.isAncestorOf(b) || b.isAncestorOf(a)) return;
      const p = collide(a.worldShape()!, b.worldShape()!);
      if (!p) return;
      add(a, b, p);
      add(b, a, { nx: -p.nx, ny: -p.ny, depth: p.depth });
    });

    const began: [GameObject, GameObject, Penetration][] = [];
    const ended: [GameObject, GameObject][] = [];
    for (const [a, map] of current) {
      const before = this.contacts.get(a);
      for (const [b, p] of map) if (!before?.has(b)) began.push([a, b, p]);
    }
    for (const [a, map] of this.contacts) {
      const now = current.get(a);
      for (const b of map.keys()) if (!now?.has(b)) ended.push([a, b]);
    }
    this.contacts.clear();
    for (const [a, map] of current) this.contacts.set(a, map);

    for (const [a, b, p] of began) {
      if (a.alive && b.alive && a.collision.events !== false && this.listens(a, b)) {
        a.onCollide?.(b, { other: b, penetration: p });
      }
    }
    for (const [a, b] of ended) {
      if (a.alive && a.collision.events !== false && this.listens(a, b)) a.onCollideEnd?.(b);
    }

    for (const object of bodies) {
      if (!object.alive) continue;
      const r = shapeBounds(object.worldShape()!);
      const side: Side | undefined =
        r.x + r.width < bounds.x
          ? 'left'
          : r.x > bounds.x + bounds.width
            ? 'right'
            : r.y + r.height < bounds.y
              ? 'top'
              : r.y > bounds.y + bounds.height
                ? 'bottom'
                : undefined;
      const was = this.outside.get(object);
      if (side && !was) {
        this.outside.set(object, side);
        object.onLeave?.(side);
      } else if (!side && was) {
        this.outside.delete(object);
      }
    }
  }

  /** Objects currently overlapping `object` (as of the last step). */
  contactsOf(object: GameObject): ReadonlyMap<GameObject, Penetration> {
    return this.contacts.get(object) ?? new Map();
  }

  /**
   * Current contacts by object id. Rollback restores them with the objects: otherwise a replayed
   * step would not report `onCollide` for a contact that began in a step that was undone.
   */
  capture(): CollisionState {
    const contacts: [number, number, Penetration][] = [];
    for (const [a, map] of this.contacts)
      for (const [b, p] of map) contacts.push([a.id, b.id, { ...p }]);
    return { contacts, outside: [...this.outside].map(([o, side]) => [o.id, side] as const) };
  }

  /** Returns to a state from {@link capture}; `lookup` finds objects by id. */
  restore(state: CollisionState, lookup: (id: number) => GameObject | undefined): void {
    this.contacts.clear();
    this.outside.clear();
    for (const [aId, bId, p] of state.contacts) {
      const a = lookup(aId);
      const b = lookup(bId);
      if (!a || !b) continue;
      let map = this.contacts.get(a);
      if (!map) this.contacts.set(a, (map = new Map()));
      map.set(b, { ...p });
    }
    for (const [id, side] of state.outside) {
      const object = lookup(id);
      if (object) this.outside.set(object, side);
    }
  }

  /** Forgets an object (destroyed). */
  remove(object: GameObject): void {
    this.contacts.delete(object);
    for (const map of this.contacts.values()) map.delete(object);
    this.outside.delete(object);
  }

  /** Objects whose shape overlaps `shape` right now, optionally filtered. */
  query(shape: WorldShape, filter?: (object: GameObject) => boolean): GameObject[] {
    const out: GameObject[] = [];
    const bounds = shapeBounds(shape);
    for (const object of this.objects()) {
      if (!object.alive || (filter && !filter(object))) continue;
      const other = object.worldShape();
      if (!other) continue;
      const b = shapeBounds(other);
      if (
        b.x > bounds.x + bounds.width ||
        b.x + b.width < bounds.x ||
        b.y > bounds.y + bounds.height ||
        b.y + b.height < bounds.y
      )
        continue;
      if (collide(shape, other)) out.push(object);
    }
    return out;
  }

  /**
   * Solid shapes that block `mover` at its shape translated by (dx, dy). Jump-through solids only
   * block when `mover` was above them before moving down.
   */
  private blockers(
    mover: GameObject,
    shape: WorldShape,
    dy: number,
  ): { shape: WorldShape; object?: GameObject }[] {
    const bounds = shapeBounds(shape);
    const result: { shape: WorldShape; object?: GameObject }[] = [];
    const bottomBefore = bounds.y + bounds.height - dy;
    const passes = (solidTop: number, jumpThru: boolean) =>
      !jumpThru || (dy > 0 && bottomBefore <= solidTop + 0.01);
    for (const object of this.objects()) {
      if (
        object === mover ||
        !object.alive ||
        !(object.collision.solid || object.collision.jumpThru)
      )
        continue;
      if (object.isAncestorOf(mover) || mover.isAncestorOf(object) || !this.listens(mover, object))
        continue;
      const other = object.worldShape();
      if (!other) continue;
      if (!passes(shapeBounds(other).y, !!object.collision.jumpThru && !object.collision.solid))
        continue;
      if (collide(shape, other)) result.push({ shape: other, object });
    }
    for (const provider of this.providers) {
      for (const solid of provider.solidShapes(bounds)) {
        if (!passes(shapeBounds(solid.shape).y, solid.jumpThru)) continue;
        if (collide(shape, solid.shape)) result.push({ shape: solid.shape });
      }
    }
    return result;
  }

  /** `true` when `object`'s shape, moved by (dx, dy), would overlap a solid. */
  blockedAt(object: GameObject, dx: number, dy: number): boolean {
    const shape = object.worldShape();
    if (!shape) return false;
    return this.blockers(object, translateShape(shape, dx, dy), dy).length > 0;
  }

  /**
   * Moves `object` by (dx, dy), stopping at solids. Horizontal movement climbs slopes up to
   * `climb` pixels per pixel moved. Moves in steps of at most one pixel so fast objects do not
   * tunnel through thin walls.
   */
  move(object: GameObject, dx: number, dy: number, climb = 0): MoveResult {
    const result: MoveResult = { blockedX: false, blockedY: false, touched: [] };
    if (!object.worldShape() || object.collision.blockedBySolids === false) {
      object.x += dx;
      object.y += dy;
      return result;
    }
    const touch = (hits: { object?: GameObject }[]) => {
      for (const hit of hits)
        if (hit.object && !result.touched.includes(hit.object)) result.touched.push(hit.object);
    };
    const axis = (amount: number, horizontal: boolean) => {
      let remaining = amount;
      while (remaining !== 0) {
        const step = Math.abs(remaining) > 1 ? Math.sign(remaining) : remaining;
        const sx = horizontal ? step : 0;
        const sy = horizontal ? 0 : step;
        const shape = object.worldShape()!;
        const hits = this.blockers(object, translateShape(shape, sx, sy), sy);
        if (hits.length === 0) {
          object.x += sx;
          object.y += sy;
          remaining -= step;
          continue;
        }
        if (horizontal && climb > 0) {
          let climbed = false;
          for (let up = 1; up <= Math.ceil(climb * Math.abs(step)); up++) {
            if (this.blockers(object, translateShape(shape, sx, -up), -up).length === 0) {
              object.x += sx;
              object.y -= up;
              remaining -= step;
              climbed = true;
              break;
            }
          }
          if (climbed) continue;
        }
        // Close the gap to the solid: exactly for boxes, by bisection for other shapes.
        const contact = this.contactDistance(object, shape, hits, sx, sy);
        object.x += horizontal ? contact : 0;
        object.y += horizontal ? 0 : contact;
        touch(hits);
        if (horizontal) result.blockedX = true;
        else result.blockedY = true;
        return;
      }
    };
    axis(dx, true);
    axis(dy, false);
    return result;
  }

  /** Signed distance (along the step) the mover can travel before touching the blockers. */
  private contactDistance(
    mover: GameObject,
    shape: WorldShape,
    hits: { shape: WorldShape }[],
    sx: number,
    sy: number,
  ): number {
    const step = sx !== 0 ? sx : sy;
    if (shape.kind === 'box' && hits.every((h) => h.shape.kind === 'box')) {
      const r = shape.rect;
      let allowed = Math.abs(step);
      for (const hit of hits) {
        const b = (hit.shape as { rect: Rect }).rect;
        const gap =
          sx > 0
            ? b.x - (r.x + r.width)
            : sx < 0
              ? r.x - (b.x + b.width)
              : sy > 0
                ? b.y - (r.y + r.height)
                : r.y - (b.y + b.height);
        allowed = Math.min(allowed, Math.max(0, gap));
      }
      return Math.sign(step) * allowed;
    }
    let low = 0;
    let high = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      if (this.blockers(mover, translateShape(shape, sx * mid, sy * mid), sy * mid).length === 0)
        low = mid;
      else high = mid;
    }
    return step * low;
  }

  /**
   * First object or solid hit by the segment from `from` to `to`.
   *
   * @param filter - Objects to consider; solids from tilemaps are always considered.
   */
  raycast(
    from: Point,
    to: Point,
    filter?: (object: GameObject) => boolean,
  ): RaycastHit | undefined {
    const length = DMath.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) return undefined;
    const dx = (to.x - from.x) / length;
    const dy = (to.y - from.y) / length;
    let best: RaycastHit | undefined;
    const consider = (shape: WorldShape, object: GameObject | undefined) => {
      const t = rayShape(from.x, from.y, dx, dy, length, shape);
      if (t !== undefined && (!best || t < best.distance)) {
        best = { object, distance: t, point: { x: from.x + dx * t, y: from.y + dy * t } };
      }
    };
    for (const object of this.objects()) {
      if (!object.alive || (filter && !filter(object))) continue;
      const shape = object.worldShape();
      if (shape) consider(shape, object);
    }
    const area = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
    for (const provider of this.providers)
      for (const solid of provider.solidShapes(area)) consider(solid.shape, undefined);
    return best;
  }
}
