# Tutorial: behaviors

A behavior is a piece of logic attached to an object: eight-way movement, platformer physics, bouncing, following a path. The object lists them in `static behaviors`, each one built by a function of `behaviors` with its options (`behaviors.eightDirections({ speed: 600 })`). Every spawned object gets its own instance, which runs on every step before the object's `update()`. The engine has 19 ready-made behaviors ([Behaviors](../guide/behaviors) lists them, each with a live example), and you write your own as a small class. A behavior can be reached at run time with `object.behavior('name')`, to read its state or turn it off.

Click a preview to give it the keyboard: arrows or WASD move the ship.

## Exercise 1: options

<BlExercise src="tutorials/behaviors/1-speed">

The ship crawls at 200 pixels per second. Change the `speed` option of its `eightDirections` behavior to 600, then move it around. `acceleration` and `deceleration` (pixels per second, per second) set how fast it reaches that speed and stops: try `deceleration: 600` to make it slide.

::: details Hint
The options are the object given to `behaviors.eightDirections(…)` in `static behaviors`.
:::

</BlExercise>

## Exercise 2: a second behavior

<BlExercise src="tutorials/behaviors/2-wrap">

Fly off the screen: the ship is gone. Add `behaviors.wrapAroundScreen()` to the ship's behaviors, after the movement: leaving one edge brings it back on the opposite edge.

::: details Hint
`static behaviors` is an array: add an element after `behaviors.eightDirections(…)`. Behaviors run in the order of the array.
:::

</BlExercise>

The ship comes back once it is fully past the edge. `wrapAroundScreen({ margin: 300 })` adds 300 pixels to travel out of view before it does.

## Exercise 3: turn a behavior off

<BlExercise src="tutorials/behaviors/3-enabled">

The star floats with `sineWave`. Every behavior has an `enabled` flag; a disabled behavior is skipped until it is enabled again. In an `update()` of `Star`, set the `enabled` flag of its `sineWave` behavior to false while Space (the `jump` action) is held, and back to true otherwise.

::: details Hint
`this.behavior('sineWave')` returns the star's instance (or `undefined` if it has none, hence the `!`). `this.input.held('jump')` is true on every step the key is down.
:::

</BlExercise>

For a ready-made behavior, `this.behavior<EightDirections>('eightDirections')` returns it typed, with its own fields: `facing` is the last direction the ship moved.

## Exercise 4: write a behavior

<BlExercise src="tutorials/behaviors/4-custom">

`Spin` is a behavior written for this example: a class that extends `Behavior` with a `name` and an `update(object, dt)` method, plus a spec function, `spin(options)`, that makes one instance per object. The star lists `spin({ speed: 3 })`, but `update` does nothing yet. Make it turn the object by `this.options.speed` radians per second.

::: details Hint
`dt` is the length of a step in seconds (1/60). Adding `speed * dt` to `object.rotation` on every step turns it by `speed` per second. Rename `_object` and `_dt` once you use them: the underscore marks unused parameters.
:::

</BlExercise>

Add `spin({ speed: -6 })` to the ship's behaviors: the same class turns it the other way, with its own options. Behaviors that hold state (a timer, a target) keep it in fields of the class, one copy per object.

## What you used

| API                                   | Does                                             |
| ------------------------------------- | ------------------------------------------------ |
| `static behaviors = [ … ]`            | Behaviors of every object of the class, in order |
| `behaviors.eightDirections({ … })`, … | The 19 ready-made behaviors and their options    |
| `object.behavior('name')`             | The object's instance of a behavior              |
| `behavior.enabled`                    | Skips the behavior while false                   |
| `class X extends Behavior<Options>`   | Your own behavior: `name`, `update(object, dt)`  |

Next: [Behaviors](../guide/behaviors) explains `attach`, `detach` and `ownsMovement`; the [sprites tutorial](./sprites) animates a character that a behavior moves.
