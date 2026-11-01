# Tutorial: objects

Everything a scene draws or moves is a game object: the player, a coin, a wall, a line of text. An object is a class that extends one of the built-in kinds: `Graphics` (shapes drawn in code), `Sprite` (frames of an image), `Text`, `Container` (a group). `this.spawn(Class, props)` creates one in the scene and sets its properties from `props`, so any field of the class can be given at spawn time: `x`, `y`, `alpha`, `rotation`, and your own fields such as `radius` below. An object has the same two methods as a scene: `create()` once, after its properties are set, and `update()` on every fixed step. [Objects](../guide/objects) has the full reference.

## Exercise 1: spawn with properties

<BlExercise src="tutorials/objects/1-spawn">

`Planet` has two fields, `radius` and `color`, used by `create()` to draw it. The scene spawns two planets. Add a third one at `x: 1000`, `y: 360`, with a radius of 40 and the color `0xe60012` (red).

::: details Hint
Copy the second `this.spawn(Planet, { … })` line and change its properties.
:::

</BlExercise>

Fields are set before `create()` runs, so `create()` sees the spawned values. A property the class does not have is a type error: try `this.spawn(Planet, { size: 40 })`.

## Exercise 2: update every step

<BlExercise src="tutorials/objects/2-update">

Make the planets turn. Add a field `speed = 0` (radians per second) to `Planet`, add an `update()` method that adds `this.speed / 60` to `this.rotation`, and spawn the red planet with `speed: 2`. The other two keep the default and stand still.

::: details Hint
`update()` runs 60 times per second, whatever the display's refresh rate: a step is 1/60 s, so `speed / 60` per step is `speed` per second. Write it as `override update() { … }`, next to `create()`.
:::

</BlExercise>

Each planet is its own instance: changing `speed` on one leaves the others alone. Set `speed: -1` on the white planet to turn it the other way.

## Exercise 3: children

<BlExercise src="tutorials/objects/3-children">

An object spawned with `parent: other` is drawn inside `other`: its `x` and `y` are relative to the parent, and it moves, turns, scales and fades with it. Keep the red planet in a variable and spawn a small planet (radius 14) as its child, 90 pixels to its right. Since the red planet turns, the moon orbits it.

::: details Hint
`const red = this.spawn(Planet, { … });` then `this.spawn(Planet, { parent: red, x: 90, radius: 14 })`. The child's `y` is 0 by default: the parent's center line.
:::

</BlExercise>

Destroying the parent destroys its children: add `this.after(3000, () => red.destroy())` at the end of `create()` and both disappear together.

## What you used

| API                           | Does                                            |
| ----------------------------- | ----------------------------------------------- |
| `class X extends Graphics`    | A game object drawn in code                     |
| `this.spawn(X, { … })`        | Creates it and sets its fields                  |
| `create()`, `update()`        | Once after spawning; every fixed step           |
| `rotation`, `x`, `y`, `alpha` | Transform and look of the object                |
| `parent: other`               | Draws the object inside `other`, relative to it |

Next: [Objects](../guide/objects) covers layers, tags, `find` and the built-in kinds; the [behaviors tutorial](./behaviors) moves objects without writing `update()` code.
