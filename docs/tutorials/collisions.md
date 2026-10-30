# Tutorial: collisions

An object takes part in collisions through its hitbox: `static hitbox` is a box, a circle or a polygon around its origin (sprites get one from their `.anim.json`). On every step, after the objects moved, the engine finds the pairs whose hitboxes started to overlap and calls `onCollide(other)` on each side. `static collision` sets how the object collides: its `layer` (a name), the layers it cares about (`mask`, every layer by default) and whether it is `solid`, which stops objects that move into it instead of letting them overlap. [Collisions and physics](../guide/collisions) has the full reference, including raycasts and Rapier physics.

Click a preview to give it the keyboard; arrows or WASD move the white square.

## Exercise 1: pick up coins

<BlExercise src="tutorials/collisions/1-pickup">

`Player.onCollide` runs when the square starts touching something; for now it only changes the square's alpha. Make it destroy the coin it touches, and only coins: walking over the spikes must not destroy them.

::: details Hint
`other.is(Coin)` tells whether `other` is a coin (an instance of the class, or of a subclass). `other.destroy()` removes it from the scene.
:::

::: details Solution
<<< @/examples/tutorials/collisions/1-pickup.solution.ts{15}
:::

</BlExercise>

`is` also takes a name or a tag: `other.is('Coin')`, or `other.is('pickup')` for every object whose class declares `static tags = ['pickup']`. Tags let one test cover coins, hearts and keys.

## Exercise 2: a solid wall

<BlExercise src="tutorials/collisions/2-solid">

Walk right: the square goes through the grey wall. Add `solid: true` to the wall's `collision` settings and walk into it again.

::: details Hint
`static collision = { layer: 'walls', solid: true }`.
:::

::: details Solution
<<< @/examples/tutorials/collisions/2-solid.solution.ts{30}
:::

</BlExercise>

The square stops against the wall because it moves with a movement behavior, which asks the engine to move it and checks solids on the way. Code that sets `x` directly bypasses solids. Pushing against a solid is not an overlap, so it calls no `onCollide`.

## Exercise 3: hazards

<BlExercise src="tutorials/collisions/3-spikes">

Make the spikes deadly: when the square touches them, destroy the square. Walk down onto them to try it, then press **Run again** to get the square back.

::: details Hint
Same place as the coins: one more test in `Player.onCollide`, with `this.destroy()`.
:::

::: details Solution
<<< @/examples/tutorials/collisions/3-spikes.solution.ts{16}
:::

</BlExercise>

A game would rather send the player back: `this.teleport(240, 360)` puts it at the start without the slide that display interpolation would draw between the two positions. To have only the spikes listen, give `Spikes` an `onCollide` of their own and a `mask: ['player']`, as the reference does for coins.

## What you used

| API                                       | Does                                          |
| ----------------------------------------- | --------------------------------------------- |
| `static hitbox`                           | Box, circle or polygon used for collisions    |
| `static collision`                        | `layer`, `mask`, `solid`, `jumpThru`          |
| `onCollide(other)`, `onCollideEnd(other)` | The two objects started / stopped overlapping |
| `other.is(Class or name)`                 | What the other object is                      |
| `destroy()`                               | Removes an object                             |

Next: [Collisions and physics](../guide/collisions) covers contacts, raycasts, tilemap solids and physics bodies; the [camera tutorial](./camera) follows a player through a world larger than the screen.
