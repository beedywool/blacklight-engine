# Hit feedback

A hit reads well when several small effects happen at once: the camera shakes, the character blinks, a number pops up, and the character is pushed away. Each one is a single call in Blacklight Engine; the blinking also serves as the invulnerability window, so one hit is counted per contact.

<LiveExample src="recipes/hit-feedback" hint="Click the preview and run into the red blocks with the arrows." />

| Effect        | Call                                          | Notes                                                                                    |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Screen shake  | `scene.camera.shake(intensity, ms)`           | Intensity in world pixels, fading out; a new shake never weakens one in progress.        |
| Blinking      | `behavior<Flash>('flash').start(ms)`          | `flashing` stays `true` until it ends: use it as the invulnerable state.                 |
| Damage number | `damageNumber(game, object, amount, options)` | From `@blacklight/ui`: a DOM text over the object, bigger and yellow with `critical`.    |
| Knockback     | `object.tween({ x, y }, { duration })`        | A short tween away from the source. Use `move()` in `update()` to stop at walls instead. |

`onCollide` runs when two hitboxes start overlapping, from the side of each object. Putting the reaction in the object that is hit, and filtering on the other object's class with `other.is(Spike)`, keeps enemies free of player code. For damage from bullets that are destroyed on impact, read the bullet's properties (damage, owner) before calling `destroy()`.

See [Camera](../guide/camera), [flash](../behaviors/flash), [World-anchored UI](../guide/ui-world) and [Time and events](../guide/time-and-events) for tweens.
