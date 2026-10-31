# Tutorial: input

Game code never asks for a key. It asks for an action: `left`, `jump`, `confirm`, `pause`. Each action is bound to keys, gamepad buttons and sticks, so the same line works with a keyboard, a gamepad or both, and players can rebind controls without code changes. Three questions cover most needs: `this.input.pressed(action)` is true on the one step the action goes down, `held(action)` on every step it is down, `released(action)` on the step it goes up. `vector('left', 'right', 'up', 'down')` combines four actions into a direction of length 0 to 1, with analog values from a stick. The pointer (mouse, touch, pen) is `this.pointer`. [Input](../guide/input) lists the default actions and every binding name.

Click a preview to give it the keyboard; arrows or WASD move the dot.

## Exercise 1: held

<BlExercise src="tutorials/input/1-held">

Make the dot grow to 1.5 times its size while Space is held, and shrink back when it is released. Space is bound to the default `jump` action (with Z and the A button).

::: details Hint
`this.input.held('jump')` is a boolean, true on every step the key is down. `this.dot.scale.set(1.5)` scales both axes.
:::

::: details Solution
<<< @/examples/tutorials/input/1-held.solution.ts{30}
:::

</BlExercise>

Replace `held` with `pressed`: the dot grows for one step only, 1/60 of a second, too short to see. `pressed` is for things that happen once per press (a jump, a shot, a menu choice), `held` for things that last (a charge, a run button).

## Exercise 2: your own action

<BlExercise src="tutorials/input/2-action">

Actions are declared in the game config (`input.actions` in `game.config.ts`; here, the `config` export of the example). Add a `dash` action bound to the C key and the B button of a gamepad, and move the dot 200 pixels to the right on each press of `dash`.

::: details Hint
Key names are `KeyboardEvent.code` values (`KeyC`, `Space`, `ArrowLeft`), gamepad buttons are `Pad:A`, `Pad:B`… The example needs `type GameConfig` in its import to type `config`.
:::

::: details Solution
<<< @/examples/tutorials/input/2-action.solution.ts{2,4-7,36}
:::

</BlExercise>

In a project, the CLI generates the list of action names from `game.config.ts`, so `this.input.pressed('dsah')` is a type error and the VS Code extension completes the names. Bindings declared in the config are added to the defaults, which stay: `left` is still the arrows, WASD and the D-pad.

## Exercise 3: the pointer

<BlExercise src="tutorials/input/3-pointer">

`this.pointer` is the mouse, a finger or a pen, in the scene's coordinates: `x` and `y`, and `pressed`, `down`, `released` like an action. Move the dot to the pointer's position when it is pressed, then click around the preview.

::: details Hint
`this.pointer.pressed` is true on the step of the click. `this.dot.teleport(x, y)` sets both coordinates at once, without the slide that display interpolation would draw from the old position ([Objects](../guide/objects#position-and-interpolation)).
:::

::: details Solution
<<< @/examples/tutorials/input/3-pointer.solution.ts{37}
:::

</BlExercise>

The text at the top shows `this.input.lastDevice`: `keyboard`, `mouse`, `touch` or `gamepad`, whichever the player used last. Input prompts in menus follow it, to show the key or the button the player is about to press.

## What you used

| API                                            | Does                                               |
| ---------------------------------------------- | -------------------------------------------------- |
| `this.input.pressed / held / released(action)` | Once per press / every step / once per release     |
| `this.input.vector(left, right, up, down)`     | A direction from four actions, analog with a stick |
| `input.actions` in the config                  | Your own actions and extra bindings                |
| `this.pointer`                                 | Mouse, touch or pen: `x`, `y`, `pressed`, `down`   |
| `this.input.lastDevice`                        | The device used last                               |

Next: [Input](../guide/input) covers rebinding, several local players and gamepad rumble; the [collisions tutorial](./collisions) makes the moving object hit things.
