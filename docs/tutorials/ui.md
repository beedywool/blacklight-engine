# Tutorial: UI screens and widgets

Menus, HUDs and dialogs are Vue components drawn in HTML over the game canvas, in the same virtual pixels as the game: `left: 40px` is 40 pixels of the 1280 × 720 design area, whatever the window size. A component shown by the UI layer is a screen. A scene opens one with `this.ui.open(Screen)` (shown, never takes input: HUDs) or `this.ui.push(Screen)` (on top, takes the keyboard and gamepad until it closes: menus). `@blacklight/ui` provides the widgets (`MenuList`, `Slider`, `Gauge`, `Tabs` and a dozen more) with focus and gamepad navigation built in. [UI layer](../guide/ui) and [Widgets](../guide/ui-widgets) have the full reference.

In a project, each screen is a `.vue` file in `ui/` with a template, opened by its name (`this.ui.push('PauseMenu')`). The examples on this page fit in one `.ts` file, so their screens are written with Vue's `h()` render function instead: `h('div', { style }, children)` is `<div :style>children</div>`. The engine treats both the same way.

Click a preview to give it the keyboard.

## Exercise 1: push a menu

<BlExercise src="tutorials/ui/1-push">

The scene opens the HUD with `this.ui.open(Hud)`. `Menu` is written but never shown. In the scene's `update()`, push it when the `pause` action (Escape, or Start on a gamepad) is pressed. Enter on RESUME closes it, and so does Escape: `back` closes a pushed screen by default.

::: details Hint
`this.ui.push(Menu)`, inside `if (this.input.pressed('pause'))`.
:::

::: details Solution
<<< @/examples/tutorials/ui/1-push.solution.ts{47-49}
:::

</BlExercise>

The white dot keeps moving under the menu: pushing a screen takes the input, not the time. `this.game.pause()` would also freeze the scene; the [scenes tutorial](./scenes) shows an overlay scene, the other way to build a pause.

## Exercise 2: a widget

<BlExercise src="tutorials/ui/2-slider">

Add a `Slider` labelled VOLUME under the menu list, holding a value from 0 to 1 in a `ref` of the menu. Open the menu, then move between RESUME and the slider with the arrows; left and right change the slider, and the mouse drags it.

::: details Hint
Import `Slider` from `@blacklight/ui`. In `h()`, `v-model` is written as two props: `modelValue: volume.value` and `'onUpdate:modelValue': (value: number) => (volume.value = value)`.
:::

::: details Solution
<<< @/examples/tutorials/ui/2-slider.solution.ts{3,23,34-38}
:::

</BlExercise>

Focus moves between every focusable widget of the screen in reading order, and the focused one gets the white outline. In a `.vue` file the slider is one line: `<Slider v-model="volume" label="VOLUME" />`.

## Exercise 3: a gauge in the HUD

<BlExercise src="tutorials/ui/3-gauge">

The HUD writes `HP 5 / 5` as text, and the scene takes one point every 1.5 seconds. Replace the text with a `Gauge` of `value` `hp.value` and `max` 5, keeping the text as its label (the default slot).

::: details Hint
`h(Gauge, { value: hp.value, max: 5 }, () => 'label')`: the third argument of `h` for a component is its slot content.
:::

::: details Solution
<<< @/examples/tutorials/ui/3-gauge.solution.ts{3,15}
:::

</BlExercise>

`hp` is a Vue `ref` outside the scene: the scene writes it, the HUD reads it, and Vue redraws the HUD when it changes. Each hit leaves a trail that drains after the bar, the usual way to show how much was lost.

## What you used

| API                           | Does                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `this.ui.open(Screen, props)` | Shows a screen that takes no input (HUD)                  |
| `this.ui.push(Screen, props)` | Shows a screen on top that takes input until it closes    |
| `useScreen({ enter, leave })` | The screen's transitions and `close()`                    |
| `MenuList`, `Slider`, `Gauge` | Widgets with focus, keyboard, gamepad and pointer support |
| `ref()`                       | State shared by the scene and its screens                 |

Next: [Widgets](../guide/ui-widgets) shows the sixteen widgets, each with a live example; [Ready-made screens](../guide/ui-screens) has a settings screen and a pause menu to start from; the [transitions tutorial](./transitions) animates screens and scene changes.
