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

Each ready-made behavior has its own page with its options and a live example you can edit.

## Ready-made behaviors

| Behavior                                                                                             | What it does                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <span id="eightdirections"></span>[`eightDirections`](../behaviors/eight-directions)                 | Top-down movement driven by input.                                                                                                                                                        |
| <span id="fourdirections"></span>[`fourDirections`](../behaviors/four-directions)                    | Same options as `eightDirections`; moves on one axis at a time (the stronger input wins). For grid-like games and classic RPG movement. `facing` is one of `right`, `down`, `left`, `up`. |
| <span id="platformer"></span>[`platformer`](../behaviors/platformer)                                 | Side-view movement with gravity: running, variable jump height, coyote time, jump buffering, slopes, one-way platforms and moving platforms.                                              |
| <span id="gridmovement"></span>[`gridMovement`](../behaviors/grid-movement)                          | Moves cell by cell, for puzzle games, tactics and roguelikes. The object stays on cell centers.                                                                                           |
| <span id="pointer"></span>[`pointer`](../behaviors/pointer)                                          | Click, hover and drag with mouse or touch.                                                                                                                                                |
| <span id="draganddrop"></span>[`dragAndDrop`](../behaviors/drag-and-drop)                            | Drag objects and drop them on a grid, on snap points or on targets: inventories, card games, puzzles.                                                                                     |
| <span id="virtualjoystick"></span>[`virtualJoystick`](../behaviors/virtual-joystick)                 | On-screen joystick for touch screens. It feeds the same actions as the keyboard and gamepads, so movement behaviors work unchanged.                                                       |
| <span id="pathfollow"></span>[`pathFollow`](../behaviors/path-follow)                                | Follows a list of points.                                                                                                                                                                 |
| <span id="patrol"></span>[`patrol`](../behaviors/patrol)                                             | Walks back and forth, turning around at each end or when blocked. Guards, enemies.                                                                                                        |
| <span id="followtarget"></span>[`followTarget`](../behaviors/follow-target)                          | Moves towards a target: homing enemies, pets, missiles.                                                                                                                                   |
| <span id="bullet"></span>[`bullet`](../behaviors/bullet)                                             | Moves in a straight line, or in an arc with gravity.                                                                                                                                      |
| <span id="bounce"></span>[`bounce`](../behaviors/bounce)                                             | Moves and bounces off solids and the scene edges: balls, pucks.                                                                                                                           |
| <span id="tankrotation"></span>[`tankRotation`](../behaviors/tank-rotation)                          | Turns with left and right, drives along its rotation with up and down: tanks, cars, ships.                                                                                                |
| <span id="sinewave"></span>[`sineWave`](../behaviors/sine-wave)                                      | Oscillates a property: floating pickups, breathing UI.                                                                                                                                    |
| <span id="anchortoscreen"></span>[`anchorToScreen`](../behaviors/anchor-to-screen)                   | Keeps a world object at a fixed place on screen whatever the camera does.                                                                                                                 |
| <span id="wraparoundscreen"></span>[`wrapAroundScreen`](../behaviors/wrap-around-screen)             | Leaving one edge of the scene brings the object back from the opposite edge, as in Asteroids.                                                                                             |
| <span id="destroyoutsidelayout"></span>[`destroyOutsideLayout`](../behaviors/destroy-outside-layout) | Destroys the object once it is fully outside the scene bounds.                                                                                                                            |
| <span id="flash"></span>[`flash`](../behaviors/flash)                                                | Blinks the object: hit invulnerability, warnings.                                                                                                                                         |
| <span id="fade"></span>[`fade`](../behaviors/fade)                                                   | Fades the object in and out: popups, damage numbers, ghosts.                                                                                                                              |

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

- Per-behavior limits are listed on each behavior's page.
- Behaviors run in the order they are listed; two movement behaviors on one object both move it.
