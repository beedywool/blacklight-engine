# Tutorial: camera

Every scene has a camera, `this.camera`. It decides which part of the world shows on screen: its `x` and `y` are the world point at the center of the view, `zoom` scales the view, and `follow(object)` moves it after an object on every step. A scene's `static size` sets how big the world is; the camera never shows past its edges, so a level wider than the screen scrolls without black borders. Objects on the `hud` layer ignore the camera and stay where they are on screen. [Camera](../guide/camera) has the full reference.

The examples below run a 4000 × 1400 world on a 1280 × 720 screen. Click a preview to give it the keyboard; arrows or WASD move the white runner.

## Exercise 1: follow the runner

<BlExercise src="tutorials/camera/1-follow">

The runner leaves the screen after a second of running to the right: the camera stays at its starting place, the center of the screen. In `create()`, keep the spawned runner in a variable and make the camera follow it. The status line under this text turns to **Done** when the camera follows something.

::: details Hint
`spawn` returns the object it creates. `this.camera.follow(object)` takes it.
:::

::: details Solution
<<< @/examples/tutorials/camera/1-follow.solution.ts{22-23}
:::

</BlExercise>

Run to the right edge: the camera stops at 4000 − 640 and the runner walks to the border alone. That is `static size` at work. Remove it and run again: the camera follows into the empty space past the world.

## Exercise 2: a softer follow

<BlExercise src="tutorials/camera/2-smooth">

A camera locked on the player makes every small move scroll the whole screen. `follow` takes options: `lerp` is the share of the distance the camera covers per step (`1`, the default, is locked; `0.1` trails behind and catches up), and `deadzone` is a rectangle around the center in which the target moves without moving the camera. Give the follow a `lerp` of `0.1` and a dead zone of 300 × 200 pixels, then move in small steps and watch the camera wait.

::: details Hint
`this.camera.follow(runner, { lerp: …, deadzone: { width: …, height: … } })`.
:::

::: details Solution
<<< @/examples/tutorials/camera/2-smooth.solution.ts{24}
:::

</BlExercise>

Try `lerp: 0.02`: the camera lags so far behind that the runner can leave the screen. Values between 0.05 and 0.2 suit most games.

## Exercise 3: zoom and shake

<BlExercise src="tutorials/camera/3-zoom-and-shake">

Two more properties of the camera. `zoom` above 1 shows a smaller part of the world, bigger; below 1, more of it. `shake(intensity, duration)` moves the view randomly by up to `intensity` world pixels, fading out over `duration` milliseconds, the usual feedback for a hit or an explosion. Set the zoom to 1.5 when the scene starts, and shake the camera by 16 pixels for 300 ms when Space (the `jump` action) is pressed.

::: details Hint
Set `this.camera.zoom` in `create()`. Add an `update()` method to the scene and test `this.input.pressed('jump')` in it.
:::

::: details Solution
<<< @/examples/tutorials/camera/3-zoom-and-shake.solution.ts{24,27-29}
:::

</BlExercise>

`zoom` is a plain number, so a tween animates it: `this.tween(this.camera, { zoom: 2 }, { duration: 400 })` zooms in smoothly. With the zoom at 1.5, run to an edge: the camera still stops at the world's border, which is now closer to the runner.

## What you used

| API                                   | Does                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `static size`                         | World size; the camera stays inside it                                  |
| `this.camera.follow(object, options)` | Moves the view after `object` every step (`lerp`, `deadzone`, `offset`) |
| `this.camera.zoom`                    | Scale of the view, 1 by default                                         |
| `this.camera.shake(intensity, ms)`    | Random offset that fades out                                            |
| `layer: 'hud'`                        | Objects that ignore the camera                                          |

Next: [Camera](../guide/camera) covers several cameras (split screen), `toWorld` / `toScreen` and bounds smaller than the world.
