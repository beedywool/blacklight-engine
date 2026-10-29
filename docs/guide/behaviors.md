# Behaviors

A behavior is a reusable piece of logic attached to an object: a movement, a control scheme, an effect. Ready-made behaviors come from the `behaviors` object; each function returns a spec, and every spawned object gets its own instance.

```ts
import { Sprite, behaviors, type Platformer } from '@blacklight/core';

export default class Player extends Sprite {
  static override behaviors = [behaviors.platformer({ jumpStrength: 760 }), behaviors.flash()];

  override update() {
    const move = this.behavior<Platformer>('platformer')!;
    this.play(move.state);
    this.flipX = move.facing === 'left';
  }
}
```

| Member                     | Meaning                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `static behaviors`         | Specs attached to every instance, in order.                                      |
| `addBehavior(spec)`        | Attaches a behavior (a spec or an instance) and returns the instance.            |
| `removeBehavior(behavior)` | Detaches it.                                                                     |
| `behavior(name or class)`  | First attached behavior with that name (`'platformer'`) or class (`Platformer`). |
| `behavior.enabled`         | `false` skips its update.                                                        |

Behaviors update at every fixed step, in order, before the object's `update()`. A behavior that moves the object itself (`ownsMovement`) stops the engine from also applying `velocity`; it still writes `velocity` so animation code can read the speed. Movement behaviors use `move()`, so they stop at solids, unless stated otherwise.

Each section below lists the behavior's options. Live, editable examples arrive with the docs playground.

## eightDirections

Top-down movement driven by input.

```ts
static override behaviors = [behaviors.eightDirections({ speed: 240, acceleration: 1800 })];
```

| Option         | Default                       | Meaning                                |
| -------------- | ----------------------------- | -------------------------------------- |
| `speed`        | required                      | Top speed in px/s.                     |
| `acceleration` | instant                       | px/s² to reach top speed.              |
| `deceleration` | instant                       | px/s² to stop.                         |
| `actions`      | `left`, `right`, `up`, `down` | Actions read from the object's player. |

`facing` holds the last direction moved (`'down'` at first), one of the eight names used by [directional animations](./sprites-and-animations#directions-and-fallback). Diagonal speed is capped at `speed`. Hitting a solid zeroes the velocity on that axis.

## fourDirections

Same options as `eightDirections`; moves on one axis at a time (the stronger input wins). For grid-like games and classic RPG movement. `facing` is one of `right`, `down`, `left`, `up`.

## platformer

Side-view movement with gravity: running, variable jump height, coyote time, jump buffering, slopes, one-way platforms and moving platforms.

```ts
static override behaviors = [behaviors.platformer({ speed: 300, jumpStrength: 760, airJumps: 1 })];
```

| Option         | Default                 | Meaning                                                              |
| -------------- | ----------------------- | -------------------------------------------------------------------- |
| `speed`        | `320`                   | Top running speed in px/s.                                           |
| `acceleration` | `2400`                  | px/s² on the ground.                                                 |
| `deceleration` | `2800`                  | px/s² to stop on the ground.                                         |
| `airControl`   | `0.8`                   | Share of acceleration and deceleration available in the air, 0 to 1. |
| `gravity`      | `2200`                  | px/s².                                                               |
| `jumpStrength` | `820`                   | Initial jump speed in px/s.                                          |
| `maxFall`      | `1400`                  | Maximum falling speed in px/s.                                       |
| `coyoteTime`   | `100`                   | ms after walking off a ledge during which a jump still works.        |
| `jumpBuffer`   | `120`                   | ms before landing during which a jump press is remembered.           |
| `jumpCut`      | `0.45`                  | Upward speed is multiplied by this when jump is released early.      |
| `airJumps`     | `0`                     | Extra jumps in the air.                                              |
| `climb`        | `1`                     | Steepest walkable slope, in px up per px sideways (1 is 45°).        |
| `actions`      | `left`, `right`, `jump` | Actions read from the object's player.                               |

State for animations and game logic: `state` (`'idle'`, `'run'`, `'jump'`, `'fall'`), `facing` (`'left'` or `'right'`), `onGround`, and `platform` (the solid object stood on). `jump(strength?)` makes the object jump now, for springs or bouncing on enemies.

One-way platforms are objects with `collision: { jumpThru: true }` or `jumpThru` tiles. A solid object that moves carries what stands on it: the behavior adds the platform's movement since the last step. Walking down a slope keeps the object on the ground instead of hopping off.

## gridMovement

Moves cell by cell, for puzzle games, tactics and roguelikes. The object stays on cell centers.

```ts
static override behaviors = [behaviors.gridMovement({ cellSize: 32, speed: 8 })];

// later: walk to a cell along the shortest path
this.behavior<GridMovement>('gridMovement')!.moveTo(12, 4);
```

| Option       | Default                       | Meaning                                                     |
| ------------ | ----------------------------- | ----------------------------------------------------------- |
| `cellSize`   | required                      | Cell size in px.                                            |
| `speed`      | `6`                           | Cells per second.                                           |
| `diagonal`   | `false`                       | Allow diagonal steps in `moveTo` paths.                     |
| `actions`    | `left`, `right`, `up`, `down` | Actions read while idle.                                    |
| `controlled` | `true`                        | Read input; set `false` for objects moved only by `moveTo`. |

`cell` is the cell the object is in or heading to, `moving` is `true` while a step or a path is in progress, `path` lists the cells still to walk, and `isBlocked(column, row)` tests a cell against solids. `moveTo(column, row)` finds a path with A* and returns `false` when the cell cannot be reached. The `findPath(start, goal, blocked, { diagonal, maxNodes })` function behind it is exported for other uses; it explores at most 5000 cells by default.

`gridMovement` sets `x` / `y` directly: it does not slide along walls, it refuses to enter a blocked cell.

## pointer

Click, hover and drag with mouse or touch.

```ts
const button = this.spawn(PlayButton, { x: 960, y: 700, layer: 'hud' });
button.addBehavior(behaviors.pointer({ onClick: () => this.goto('battle') }));
```

| Option      | Default | Meaning                                        |
| ----------- | ------- | ---------------------------------------------- |
| `onDown`    | none    | Pointer pressed on the object.                 |
| `onUp`      | none    | Pointer released after pressing on the object. |
| `onClick`   | none    | Pressed and released on the object.            |
| `onEnter`   | none    | Pointer moved over the object.                 |
| `onLeave`   | none    | Pointer moved off the object.                  |
| `draggable` | `false` | The object follows the pointer while pressed.  |

Each callback receives the object. State: `hovered`, `pressed`, `dragging`. The test uses the object's hitbox, or its display bounds when it has none. Objects in the `'hud'` layer are tested in screen coordinates, others in world coordinates through the main camera. The exported `hitTest(object, point)` and `pointerFor(object)` do the same in custom code.

## dragAndDrop

Drag objects and drop them on a grid, on snap points or on targets: inventories, card games, puzzles.

```ts
static override behaviors = [
  behaviors.dragAndDrop({
    dropOn: 'slot',
    onDrop: (card, slot) => {
      if (slot) card.scene.events.emit('placed', { card, slot });
    },
  }),
];
```

| Option       | Default    | Meaning                                                                                     |
| ------------ | ---------- | ------------------------------------------------------------------------------------------- |
| `snap`       | none       | Snap to a grid of this size, or to the nearest of these points.                             |
| `snapRadius` | `Infinity` | Snap points only attract within this distance.                                              |
| `bounds`     | none       | Keep the object's position inside this rectangle while dragging.                            |
| `dropOn`     | none       | Name or tag of objects that accept drops. A drop elsewhere returns the object to its start. |
| `onDrop`     | none       | `(object, target)`; `target` is `undefined` without `dropOn` or when the drop missed.       |

The dragged object's `zIndex` is raised by 1000 while dragging, so it draws above its layer. It is a `pointer` behavior: `hovered`, `pressed` and `dragging` are available.

## virtualJoystick

On-screen joystick for touch screens. It feeds the same actions as the keyboard and gamepads, so movement behaviors work unchanged.

```ts
const stick = this.spawn(Container, { layer: 'hud' });
stick.addBehavior(behaviors.virtualJoystick({ radius: 100 }));
```

| Option          | Default                       | Meaning                                                   |
| --------------- | ----------------------------- | --------------------------------------------------------- |
| `radius`        | `90`                          | Knob travel in virtual px.                                |
| `zone`          | left half of the screen       | Screen rectangle where a touch starts the joystick.       |
| `actions`       | `left`, `right`, `up`, `down` | Actions it drives.                                        |
| `player`        | `1`                           | Player whose actions it drives.                           |
| `alwaysVisible` | `false`                       | Show the joystick at its spawn position when not touched. |

Put it on an object in the `'hud'` layer. A touch in `zone` places the joystick under the finger; the knob's offset sets the four actions (0 to 1 each). `value` holds the current direction, length 0 to 1. Releasing resets the actions to 0 and hides the joystick, or with `alwaysVisible` moves it back to where it was spawned.

## pathFollow

Follows a list of points.

```ts
static override behaviors = [
  behaviors.pathFollow({ points: [{ x: 100, y: 100 }, { x: 600, y: 100 }], speed: 120, mode: 'pingpong' }),
];
```

| Option       | Default  | Meaning                                                                                             |
| ------------ | -------- | --------------------------------------------------------------------------------------------------- |
| `points`     | required | Points in scene coordinates.                                                                        |
| `speed`      | required | px/s.                                                                                               |
| `mode`       | `'once'` | `'once'` stops at the end, `'loop'` goes back to the first point, `'pingpong'` goes back and forth. |
| `rotate`     | `false`  | Rotate the object along the path.                                                                   |
| `onComplete` | none     | Called when a `'once'` path ends, with the object.                                                  |

State: `target` (index of the point being approached) and `finished`. The behavior sets `x` / `y` directly and ignores solids.

## patrol

Walks back and forth, turning around at each end or when blocked. Guards, enemies.

```ts
static override behaviors = [behaviors.patrol({ distance: 120, speed: 60, wait: 500 })];
```

| Option     | Default  | Meaning                                        |
| ---------- | -------- | ---------------------------------------------- |
| `distance` | required | Distance from the start position each way, px. |
| `speed`    | required | px/s.                                          |
| `axis`     | `'x'`    | `'x'` or `'y'`.                                |
| `wait`     | `0`      | Pause at each end, ms.                         |

`direction` is `1` or `-1`. The start position is read when the behavior attaches.

## followTarget

Moves towards a target: homing enemies, pets, missiles.

```ts
override create() {
  this.addBehavior(behaviors.followTarget({ target: this.scene.find('Player')!, speed: 90, stopDistance: 24 }));
}
```

| Option         | Default  | Meaning                                                      |
| -------------- | -------- | ------------------------------------------------------------ |
| `target`       | required | An object, or a function returning a point (or `undefined`). |
| `speed`        | required | px/s.                                                        |
| `stopDistance` | `0`      | Stops this close to the target.                              |
| `rotate`       | `false`  | Turn to face the target.                                     |

The object stops when the target object is destroyed or the function returns `undefined`.

## bullet

Moves in a straight line, or in an arc with gravity.

```ts
// in the archer: the arrow flies along the archer's rotation
this.scene.spawn(Arrow, { x: this.x, y: this.y, rotation: this.rotation });

// arrow.object.ts
static override behaviors = [behaviors.bullet({ speed: 600, gravity: 900, rotate: true })];
```

| Option           | Default           | Meaning                                  |
| ---------------- | ----------------- | ---------------------------------------- |
| `speed`          | required          | px/s.                                    |
| `angle`          | object's rotation | Direction in degrees (0 right, 90 down). |
| `acceleration`   | `0`               | px/s² added to the speed.                |
| `gravity`        | `0`               | Downward acceleration in px/s².          |
| `rotate`         | `false`           | Rotate the object along its path.        |
| `destroyOnSolid` | `true`            | Destroy the object when it hits a solid. |

The direction is read when the behavior attaches, after spawn props, so `rotation` given to `spawn` aims the bullet.

## bounce

Moves and bounces off solids and the scene edges: balls, pucks.

| Option  | Default  | Meaning                          |
| ------- | -------- | -------------------------------- |
| `speed` | required | px/s.                            |
| `angle` | `45`     | Initial direction in degrees.    |
| `edges` | `true`   | Bounce off the scene bounds too. |

```ts
static override behaviors = [behaviors.bounce({ speed: 400, angle: 30 })];
```

## tankRotation

Turns with left and right, drives along its rotation with up and down: tanks, cars, ships.

| Option      | Default                                              | Meaning                                |
| ----------- | ---------------------------------------------------- | -------------------------------------- |
| `speed`     | required                                             | Forward speed in px/s.                 |
| `turnSpeed` | required                                             | Degrees per second.                    |
| `actions`   | `forward: 'up'`, `backward: 'down'`, `left`, `right` | Actions read from the object's player. |

```ts
static override behaviors = [behaviors.tankRotation({ speed: 200, turnSpeed: 180 })];
```

The helper `turnTowards(object, angle, degreesPerSecond, dt)` turns an object towards an angle at a maximum speed, for turrets.

## sineWave

Oscillates a property: floating pickups, breathing UI.

```ts
static override behaviors = [behaviors.sineWave({ property: 'y', amplitude: 6, period: 1 })];
```

| Option      | Default  | Meaning                                                    |
| ----------- | -------- | ---------------------------------------------------------- |
| `property`  | `'y'`    | `'x'`, `'y'`, `'alpha'`, `'angle'` (degrees) or `'scale'`. |
| `amplitude` | required | Half the range, in the property's unit.                    |
| `period`    | `1`      | Seconds per cycle.                                         |
| `phase`     | `0`      | Start offset, 0 to 1 of a cycle.                           |

It adds the change since the last step, so it combines with other movement instead of overwriting it.

## anchorToScreen

Keeps a world object at a fixed place on screen whatever the camera does.

| Option   | Default  | Meaning                                     |
| -------- | -------- | ------------------------------------------- |
| `x`      | required | 0 (left) to 1 (right) of the design width.  |
| `y`      | required | 0 (top) to 1 (bottom) of the design height. |
| `offset` | none     | `{ x, y }` in virtual px.                   |

```ts
static override behaviors = [behaviors.anchorToScreen({ x: 1, y: 0, offset: { x: -48, y: 48 } })];
```

For HUD elements, the `'hud'` layer is simpler; `anchorToScreen` is for objects that must stay in the world (they collide, they are lit by world effects).

## wrapAroundScreen

Leaving one edge of the scene brings the object back from the opposite edge, as in Asteroids.

| Option   | Default | Meaning                                          |
| -------- | ------- | ------------------------------------------------ |
| `margin` | `0`     | Distance outside the bounds before wrapping, px. |

## destroyOutsideLayout

Destroys the object once it is fully outside the scene bounds.

| Option   | Default | Meaning                                            |
| -------- | ------- | -------------------------------------------------- |
| `margin` | `64`    | Distance outside the bounds before destroying, px. |

```ts
static override behaviors = [behaviors.bullet({ speed: 900 }), behaviors.destroyOutsideLayout()];
```

The scene bounds are the design size, or `static size` of the scene.

## flash

Blinks the object: hit invulnerability, warnings.

```ts
static override behaviors = [behaviors.flash({ interval: 60 })];

hurt() {
  this.behavior<Flash>('flash')!.start(1000);
}
```

| Option      | Default | Meaning                                        |
| ----------- | ------- | ---------------------------------------------- |
| `interval`  | `80`    | On/off period in ms.                           |
| `autoStart` | none    | Start flashing for this many ms when attached. |

`start(ms)` flashes for that long, `flashing` is `true` meanwhile, `remaining` is the time left in ms. The object is visible again when it ends.

## fade

Fades the object in and out: popups, damage numbers, ghosts.

```ts
this.spawn(DamageNumber, { x, y, text: '12' }).addBehavior(
  behaviors.fade({ fadeIn: 100, wait: 400, fadeOut: 300 }),
);
```

| Option    | Default | Meaning                                  |
| --------- | ------- | ---------------------------------------- |
| `fadeIn`  | none    | Fade in over this many ms when attached. |
| `wait`    | `0`     | Then wait this long, ms.                 |
| `fadeOut` | none    | Then fade out over this many ms.         |
| `destroy` | `true`  | Destroy the object once faded out.       |

`fadeOut(ms)` starts fading out now (300 ms when neither the argument nor the option gives a duration).

## Writing your own behavior

Extend `Behavior<Options>` and export a function that returns a spec:

```ts
import { Behavior, type GameObject } from '@blacklight/core';

export interface SpinOptions {
  /** Degrees per second. */
  speed: number;
}

export class Spin extends Behavior<SpinOptions> {
  readonly name = 'spin';
  turns = 0;

  override update(object: GameObject, dt: number) {
    object.rotation += ((this.options.speed * Math.PI) / 180) * dt;
    this.turns = object.rotation / (Math.PI * 2);
  }
}

export const spin = (options: SpinOptions) => () => new Spin(options);
```

| Member               | Meaning                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `name`               | Name used by `object.behavior('spin')`.                                                             |
| `options`            | The options given to the constructor.                                                               |
| `object`             | The object it is attached to.                                                                       |
| `enabled`            | `false` skips `update`.                                                                             |
| `ownsMovement`       | Set to `true` when the behavior moves the object itself; the engine then does not apply `velocity`. |
| `attach(object)`     | Called when attached, after spawn props. Call `super.attach(object)` when overriding.               |
| `update(object, dt)` | Every fixed step, before the object's `update()`. `dt` is in seconds.                               |
| `detach(object)`     | Called when removed or when the object is destroyed.                                                |

A movement behavior sets `ownsMovement`, computes a displacement, and calls `object.move(dx, dy)` so solids stop it:

```ts
export class Drift extends Behavior<{ speed: number }> {
  readonly name = 'drift';
  override readonly ownsMovement = true;

  override update(object: GameObject, dt: number) {
    object.velocity.set(this.options.speed, 0);
    const result = object.move(this.options.speed * dt, 0);
    if (result.blockedX) object.velocity.set(0, 0);
  }
}
```

Plain data fields of a behavior (numbers, strings, arrays, plain objects, references to objects) are saved by [snapshots](./snapshots); keep runtime handles in fields the engine can skip (class instances, functions).

## Limits

- `gridMovement` and `pathFollow` set positions directly: `pathFollow` passes through solids, `gridMovement` refuses blocked cells instead of sliding.
- `virtualJoystick` reads touches only; it does not react to the mouse.
- `pointer` hit tests use the main camera; in split screen, objects seen through other cameras are not clickable.
- Behaviors run in the order they are listed; two movement behaviors on one object both move it.
