# Tutorial: sprites and animations

A `Sprite` is an object drawn from an image. For animation, the image is a sheet of frames: `hero@16x16.png` is cut into 16 × 16 frames, numbered from 0, left to right and top to bottom. An `.anim.json` file next to the object names groups of frames (`idle` is frames 0 and 1, `run` frames 2 to 5) with their speed in frames per second, and the object attaches it with `static animations`. In code, `this.play('run')` switches animation; calling it with the animation that already plays does nothing, so `update()` calls it on every step without restarting it. [Sprites and animations](../guide/sprites-and-animations) has the full reference.

These examples have three files, in the tabs over the editor: the scene (`main.ts`), the object (`hero.object.ts`) and its animations (`hero.anim.json`). The hero walks by itself; no key is needed.

The sheet: two idle frames, then four run frames.

![The hero sheet: six 16 × 16 frames, two idle poses then four running poses](../examples/assets/hero@16x16.png){style="image-rendering: pixelated; width: 384px"}

## Exercise 1: play an animation

<BlExercise src="tutorials/sprites/1-play">

The hero walks back and forth but shows its `idle` animation, the `default` of `hero.anim.json`. In `hero.object.ts`, play `run` in `update()`.

::: details Hint
`this.play('run')`. In a project, animation names are typed from the `.anim.json` files, so `this.play('runn')` is a type error; at run time a missing name plays the closest animation and logs a warning once.
:::

::: details Solution
<<< @/examples/tutorials/sprites/1-play.solution/objects/hero/hero.object.ts{12}
:::

</BlExercise>

In `hero.anim.json`, change the `fps` of `run` to 20 and then to 4: the frames are the same, the legs move faster or slower. The walking speed itself is the `3` in `update()`; matching the two is what makes feet stick to the ground.

## Exercise 2: face the way you go

<BlExercise src="tutorials/sprites/2-flip">

The sheet only has frames facing right, so the hero walks backwards to the left. Set `this.flipX` from the direction: mirrored when `direction` is negative.

::: details Hint
`flipX` is a boolean property of `Sprite`. `this.direction < 0` is the boolean you need.
:::

::: details Solution
<<< @/examples/tutorials/sprites/2-flip.solution/objects/hero/hero.object.ts{13}
:::

</BlExercise>

`flipX` mirrors around the sprite's anchor, its center by default, so the hero turns on the spot. `flipY` mirrors vertically.

## Exercise 3: a new animation

<BlExercise src="tutorials/sprites/3-jump">

Every two seconds the hero jumps (a tween on `y`), and `jumping` is true while it is in the air. Add a `jump` animation to `hero.anim.json` that holds frame 3, a running pose with the legs apart, and play it instead of `run` while `jumping` is true.

::: details Hint
In the JSON file, add an entry to `animations`: `"jump": { "frames": [3], "fps": 1 }` (mind the comma after `run`). In `update()`, `this.play(this.jumping ? 'jump' : 'run')`.
:::

::: details Solution
<<< @/examples/tutorials/sprites/3-jump.solution/objects/hero/hero.anim.json{6-7}

<<< @/examples/tutorials/sprites/3-jump.solution/objects/hero/hero.object.ts{23}
:::

</BlExercise>

`frames` takes a list (`[3]`, `[0, 1]`) or a range (`{ "from": 2, "to": 5 }`). An animation can also name events on frames (`"events": { "0": "step" }`) that the object hears with `this.onFrame('step', ({ animation, frame }) => …)`, to play footstep sounds in time with the feet; `frame` is the index within the animation, the same number as the key in `events`.

## What you used

| API                            | Does                                                   |
| ------------------------------ | ------------------------------------------------------ |
| `name@16x16.png`               | A sheet cut into 16 × 16 frames                        |
| `.anim.json`                   | Named animations: `frames`, `fps`, `default`, `events` |
| `static animations = anims`    | Attaches the file to the object                        |
| `this.play(name)`              | Switches animation; no restart if it already plays     |
| `flipX`, `flipY`               | Mirror the sprite                                      |
| `this.animation`, `this.frame` | Current animation and frame                            |

Next: [Sprites and animations](../guide/sprites-and-animations) covers Aseprite files, hitboxes per animation and directional animations; the [input tutorial](./input) gives the controls to the player.
