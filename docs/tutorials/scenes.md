# Tutorial: scenes

A game is a set of scenes: a title, levels, a results screen. Exactly one scene runs at a time (plus overlays, below). A scene is a class that extends `Scene`: `create(params)` builds it once when it starts, `update()` runs on every fixed step (60 per second), and when the game leaves it, every object, timer and tween it made is destroyed with it. `this.goto(name, params)` switches to another scene; `params` arrive in the new scene's `create()`, typed by the scene's type parameter (`Scene<{ number: number }>`). In a project, each scene is a folder under `scenes/` and its name is the folder's; in these examples the scenes are classes in one file, listed in `export const scenes`, and the first one is called `main`. [Scenes](../guide/scenes) has the full reference.

The example has three scenes: the title, a level with a ball and a countdown, and a results screen that nothing opens yet. Click a preview to give it the keyboard.

## Exercise 1: start without a key

<BlExercise src="tutorials/scenes/1-auto-start">

Press Enter in the preview: the title switches to level 1. Keep that, and also make the title start level 1 by itself 1.5 seconds after it appears, as an attract mode would.

::: details Hint
`this.after(ms, callback)` runs `callback` once after `ms` milliseconds of game time. Call it in `create()`. Timers belong to the scene: if Enter switches first, the timer is dropped with the title and never fires.
:::

::: details Solution
<<< @/examples/tutorials/scenes/1-auto-start.solution.ts{18}
:::

</BlExercise>

`void` in front of `this.goto(…)` says that the returned promise is ignored on purpose: it resolves once the new scene has started, which matters only to code that has to wait for it.

## Exercise 2: pass parameters

<BlExercise src="tutorials/scenes/2-parameters">

`Level` reads `number` from its parameters and shows it. Make the title start level 3, from the timer and from Enter. Then use the number in the level: store a speed of `3 * number` in `create()` and move the ball by that speed instead of 6.

::: details Hint
Parameters reach `create()` only. To use one in `update()`, keep it in a field of the scene (`private speed = 6;`), set in `create()`.
:::

::: details Solution
<<< @/examples/tutorials/scenes/2-parameters.solution.ts{18,22,31,34,48}
:::

</BlExercise>

Try `this.goto('level')` without parameters, or with `{ number: 'three' }`: the editor underlines it, because `Level` declares `Scene<{ number: number }>`. `pnpm typecheck` reports the same error in a project.

## Exercise 3: an overlay

<BlExercise src="tutorials/scenes/3-overlay">

An overlay is a scene opened over the current one: the scene below keeps drawing, and by default stops updating until the overlay closes. Pause menus, results and dialogs are often overlays. When the level's countdown reaches 0, open the `results` scene as an overlay with `this.game.overlay('results')`. Enter on the results goes back to the title.

::: details Hint
The countdown runs in `this.every(1000, …)`. After `this.left--`, test whether `this.left` is 0.
:::

::: details Solution
<<< @/examples/tutorials/scenes/3-overlay.solution.ts{44}
:::

</BlExercise>

The ball stops when the results open: the level is paused under them (`pauseBelow`, true by default). `this.game.overlay('results', undefined, { pauseBelow: false })` keeps it moving. `this.game.closeOverlay(this)`, called from the overlay, closes it and resumes the level.

## What you used

| API                                        | Does                                       |
| ------------------------------------------ | ------------------------------------------ |
| `create(params)`, `update()`               | Build the scene once; run every fixed step |
| `this.goto(name, params)`                  | Switch scene; the old one is destroyed     |
| `Scene<{ … }>`                             | Types the parameters `goto` must pass      |
| `this.after(ms, fn)`, `this.every(ms, fn)` | Timers owned by the scene                  |
| `this.game.overlay(name)`                  | Open a scene over the current one          |
| `this.game.closeOverlay(scene)`            | Close it                                   |

Next: [Scenes](../guide/scenes) covers transitions between scenes, hosted sub-scenes and loading screens; the [objects tutorial](./objects) fills a scene with your own objects.
