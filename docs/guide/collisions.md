# Collisions and physics

Each scene has a collision world. It finds overlaps between objects once per fixed step, after every object has moved, and calls `onCollide`, `onCollideEnd` and `onLeave`. Solid objects and solid tiles block objects that move with `move()`, with `velocity` or with a movement behavior. Rigid-body physics (forces, stacking, restitution) is a separate package, `@blacklight/physics`, described at the end.

## Hitboxes

An object collides only when it has a hitbox. `GameObject`, `Text`, `Container` and the other plain objects default to `'none'`; `Sprite` and `Graphics` default to `'auto'`.

| Hitbox                                       | Shape                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `'auto'`                                     | Sprites: the current frame's rectangle around the anchor (or the Aseprite `hitbox` slice). Others: the display bounds. |
| `'none'`                                     | No collisions.                                                                                                         |
| `'pixel'`                                    | Opaque pixels of the current sprite frame.                                                                             |
| `{ type: 'box', x?, y?, width, height }`     | Rectangle; `x` / `y` is its top-left corner relative to the object's position.                                         |
| `{ type: 'circle', x?, y?, radius }`         | Circle around (`x`, `y`).                                                                                              |
| `{ type: 'polygon', points: [[x, y], ...] }` | Convex polygon, at least three points.                                                                                 |

Coordinates are in the object's local space: `(0, 0)` is its position. The shape follows the object's position, rotation and scale and those of its parents. A box on a rotated object becomes a polygon; a circle scales by the larger of the two scale factors.

```ts
export default class Ball extends Sprite {
  static override hitbox = { type: 'circle' as const, radius: 8 };
}
```

A sprite's hitbox can also come from its `.anim.json` (for the whole file, one animation or one frame) or from an Aseprite slice named `hitbox`; see [Sprites and animations](./sprites-and-animations). The class's `hitbox` is the default; `this.hitbox = ...` changes one instance.

F4 in the dev server draws every hitbox: orange for solids, yellow while touching something, green otherwise. See [Debugging](./debugging).

## Layers and masks

```ts
export default class Coin extends Sprite {
  static override collision = { layer: 'pickup', mask: ['player'] };
}
```

| Option            | Default     | Meaning                                                                                                     |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `layer`           | `'default'` | Collision layer name. Layers are created on first use, up to 31 per scene.                                  |
| `mask`            | every layer | Layers this object reports collisions with and is blocked by.                                               |
| `solid`           | `false`     | Blocks moving objects whose mask includes this object's layer.                                              |
| `jumpThru`        | `false`     | Solid from above only: one-way platforms.                                                                   |
| `blockedBySolids` | `true`      | `false` lets this object move through solids.                                                               |
| `events`          | `true`      | `false` turns off `onCollide` / `onCollideEnd` from hitbox overlaps for this object. Physics bodies set it. |

Masks are one-sided. `a.onCollide(b)` is called only when `b`'s layer is in `a`'s mask; `b` receives its own `onCollide(a)` only when `a`'s layer is in `b`'s mask. In the example, the coin hears about players and nothing else, while a player with the default mask (every layer) still hears about the coin. A pair is tested when at least one side listens. Collision layers are unrelated to the scene's draw layers.

The collision settings are copied to each instance, so `this.collision.solid = true` changes one object.

## Solids and jump-through platforms

```ts
export default class Wall extends GameObject {
  static override hitbox = { type: 'box' as const, width: 32, height: 32 };
  static override collision = { solid: true };
}

export default class Ledge extends GameObject {
  static override hitbox = { type: 'box' as const, width: 200, height: 10 };
  static override collision = { jumpThru: true };
}
```

A solid blocks objects that move with `move()`, `velocity` or a movement behavior, when the solid's layer is in the mover's mask: an object with `mask: ['default']` walks through solids on a `'ghost-wall'` layer. Solid tiles block every mover. A jump-through solid blocks only an object moving down whose bottom was above the platform's top before the move, so objects jump up through it and land on it. Setting `x` / `y` directly ignores solids.

Solids also take part in overlaps: an object pushed against a wall does not overlap it (touching edges do not count), but an object placed inside a wall does, and receives `onCollide`.

## Collision callbacks

```ts
override onCollide(other: GameObject, contact: Contact) {
  if (other.is('enemy') && contact.penetration.ny < 0) this.bounceOff(other);
}

override onCollideEnd(other: GameObject) {
  if (other.is('water')) this.swimming = false;
}

override onLeave(side: Side) {
  if (side === 'bottom') this.die();
}
```

| Callback                    | When                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onCollide(other, contact)` | The two objects started overlapping during this step. Each object receives it when the other's layer is in its mask and its `collision.events` is not `false`. |
| `onCollideEnd(other)`       | They stopped overlapping.                                                                                                                                      |
| `onLeave(side)`             | The object's hitbox went fully outside the scene bounds. Called once; it fires again only after the object came back inside.                                   |

`contact.penetration` is how to push this object out of the other: `nx` / `ny` is a unit normal pointing from `other` towards this object, `depth` the overlap in pixels. `ny < 0` means this object is above the other. An object never collides with its own children or parents.

The scene bounds used by `onLeave` are the design size, or the scene's `static size = { width, height }`.

## Checking overlaps in code

| Member                                       | Meaning                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `object.contacts`                            | Objects overlapping this one, as of the last collision step (every tested pair, whichever side listens). |
| `object.overlaps(other)`                     | `true` when the two hitboxes overlap right now (tested on the spot, ignoring layers).                    |
| `object.worldShape()`                        | The hitbox in scene coordinates, or `undefined`.                                                         |
| `scene.query(shape, filter?)`                | Objects whose hitbox overlaps a shape in scene coordinates.                                              |
| `scene.collisions.blockedAt(object, dx, dy)` | `true` when the object moved by (`dx`, `dy`) would overlap a solid.                                      |

`query` takes a shape in scene coordinates:

```ts
const inBlast = this.scene.query({ kind: 'circle', x: this.x, y: this.y, radius: 96 }, (o) =>
  o.is('enemy'),
);
const inBox = this.scene.query({ kind: 'box', rect: { x: 0, y: 0, width: 200, height: 100 } });
```

The shape kinds are `{ kind: 'box', rect }`, `{ kind: 'circle', x, y, radius }` and `{ kind: 'polygon', points }` with `points` as `{ x, y }` objects.

## Moving

```ts
const result = this.move(this.velocity.x * dt, this.velocity.y * dt, 1);
if (result.blockedY) this.velocity.y = 0;
```

`move(dx, dy, climb = 0)` moves horizontally first, then vertically, at most one pixel at a time, so fast objects do not pass through thin walls. When the next pixel would overlap a solid, it closes the remaining gap exactly (for boxes) or by bisection (other shapes) and stops on that axis.

`climb` is the steepest slope the object walks up, in pixels up per pixel sideways (`1` is 45°). It only applies to horizontal movement.

| Result     | Meaning                                   |
| ---------- | ----------------------------------------- |
| `blockedX` | Horizontal movement was stopped.          |
| `blockedY` | Vertical movement was stopped.            |
| `touched`  | Solid objects hit (tiles are not listed). |

An object without a hitbox, or with `blockedBySolids: false`, moves the full distance.

## Raycasts

```ts
const hit = this.scene.raycast(
  { x: this.x, y: this.y },
  { x: this.x + 400, y: this.y },
  (o) => o !== this,
);
if (hit) this.laserTo(hit.point);
```

`raycast(from, to, filter?)` returns the first hitbox or solid tile on the segment: `object` (`undefined` for a tile), `point` and `distance`. Every object with a hitbox is considered, solid or not; `filter` chooses which objects count, and solid tiles always count. A ray that starts inside a shape hits it at distance 0, so filter out the object casting the ray.

## Tilemap solids

A `TilemapLayer` with solid tiles blocks `move()` and stops raycasts like solid objects. Its tiles do not trigger `onCollide`: use the `blockedX` / `blockedY` result of `move()`, `blockedAt`, or `getTile` on the cell. Slopes are solid tiles with a polygon in `tileset.shapes`; walking up them needs `climb` (the `platformer` behavior uses 1 by default). See [Objects](./objects#tilemaplayer).

## Physics

`@blacklight/physics` runs [Rapier](https://rapier.rs) 2D rigid bodies: gravity, forces, impulses, friction, restitution, stacking. Install it in the game:

```sh
pnpm add @blacklight/physics
```

```ts
import { Sprite } from '@blacklight/core';
import { physics } from '@blacklight/physics';

export default class Crate extends Sprite {
  static override hitbox = { type: 'box' as const, x: -16, y: -16, width: 32, height: 32 };
  static override behaviors = [physics.body({ density: 2, friction: 0.8 })];
}
```

`physics.body(options)` is a behavior: it creates a body and a collider when the object spawns and, every step, copies the body's position, rotation and velocity back to the object. It also sets the object's `collision.events` to `false`, so its contacts are reported once, by Rapier.

| Option           | Default        | Meaning                                                                                                                           |
| ---------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`           | `'dynamic'`    | `'dynamic'` moves under forces, `'fixed'` never moves, `'kinematic'` follows `x` / `y` set by code.                               |
| `shape`          | object hitbox  | Box, circle or polygon collider. Without one, the object's hitbox if it is a shape, else its display bounds (16 × 16 when empty). |
| `density`        | `1`            | kg/m².                                                                                                                            |
| `friction`       | `0.5`          | Friction coefficient.                                                                                                             |
| `restitution`    | `0`            | Bounciness, 0 to 1.                                                                                                               |
| `fixedRotation`  | `false`        | Never rotates (characters).                                                                                                       |
| `linearDamping`  | Rapier default | Slows linear movement.                                                                                                            |
| `angularDamping` | Rapier default | Slows rotation.                                                                                                                   |
| `sensor`         | `false`        | Reports collisions without pushing.                                                                                               |
| `ccd`            | `false`        | Continuous collision detection for fast objects.                                                                                  |

The object's `x`, `y`, `rotation`, `scale` and `velocity` at spawn give the body's start state. Polygon colliders are convex hulls of their points.

Each scene has its own physics world, created with the first body and freed when the scene ends. Configure it in `create()` before spawning any body:

```ts
import { configurePhysics } from '@blacklight/physics';

override create() {
  configurePhysics(this, { gravity: { x: 0, y: 1400 }, pixelsPerMeter: 64 });
  this.spawn(Crate, { x: 400, y: 100 });
}
```

| Option           | Default            | Meaning                                                                               |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------- |
| `gravity`        | `{ x: 0, y: 980 }` | px/s².                                                                                |
| `pixelsPerMeter` | `50`               | Scale between pixels and Rapier meters. Rapier works best with bodies of 0.1 to 10 m. |

`configurePhysics` called after the first body exists throws. The world steps once per fixed step with `dt = 1 / tickRate`, after every object has updated and before hitbox collisions are checked, through the scene's `afterObjects` hooks. A kinematic body therefore moves to the `x` / `y` its object reached in the same step.

The behavior is a `RigidBody`:

```ts
const body = this.behavior<RigidBody>('rigidBody')!;
body.applyImpulse(0, -400);
```

| Member               | Meaning                                                   |
| -------------------- | --------------------------------------------------------- |
| `applyImpulse(x, y)` | Instant push, in px/s × mass.                             |
| `setVelocity(x, y)`  | Sets the velocity in px/s.                                |
| `teleport(x, y)`     | Moves the body and the object now, without interpolation. |
| `body`, `collider`   | The Rapier `RigidBody` and `Collider`, for anything else. |

The package also exports `RAPIER` (the initialized Rapier module) for joints and queries the engine does not wrap. Rapier is WebAssembly; it is initialized when the package is first imported, before any scene that imports it starts.

When two bodies start or stop touching, both objects receive `onCollide` and `onCollideEnd`. The `contact.penetration` of a physics contact is zero.

## Limits

- Pixel hitboxes follow translation and flips, not rotation.
- Polygon hitboxes must be convex.
- Solid tiles block every mover; masks do not apply to tilemaps.
- Tiles block movement and raycasts but do not trigger `onCollide`.
- Physics bodies only collide with other physics bodies: tilemaps and `solid` objects without a body do not stop them. Give walls a `type: 'fixed'` body.
- A physics object still has its hitbox: objects without a body can receive `onCollide` with it from the overlap test, and with `collision.solid` it blocks objects that move with `move()`. Its own `onCollide` comes only from Rapier.
- Rapier bodies are not part of [snapshots](./snapshots): restoring a snapshot moves the objects but not their bodies.
