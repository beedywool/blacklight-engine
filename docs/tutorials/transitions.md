# Tutorial: transitions

A transition is the animation that hides one thing and shows another: a scene change, or a screen that opens and closes. Both take a transition by name. `this.goto(name, params, { transition: 'iris' })` covers the old scene, switches, and uncovers the new one. A screen gets one for entering and one for leaving: `this.ui.open(Screen, props, { enter: 'slash', leave: 'slash' })`, or `useScreen({ enter, leave })` inside the screen. `@blacklight/ui` defines fourteen (`fade`, `slide-left`, `iris`, `slash`, `shatter`, `ink`…), and `defineTransition` adds your own. [Transitions](../guide/ui-transitions) shows each one with a live example.

The example swaps two rooms every 2.4 seconds and shows a menu for 1.4 seconds in each; no key is needed. These exercises have no automatic check: a transition is something to watch, so the status line is left out.

## Exercise 1: between scenes

<BlExercise src="tutorials/transitions/1-scene">

The rooms swap from one frame to the next. Pass `{ transition: 'iris' }` as the third argument of `goto`; the second, the scene's parameters, stays `undefined`. Then try `'fade'`, `'slash'` and `'shatter'`.

::: details Hint
`this.goto(this.next, undefined, { transition: 'iris' })`.
:::

::: details Solution
<<< @/examples/tutorials/transitions/1-scene.solution.ts{28}
:::

</BlExercise>

The old scene is destroyed and the new one created while the screen is covered, so the player never sees a half-built scene.

## Exercise 2: screens

<BlExercise src="tutorials/transitions/2-screen">

The menu pops in and out. Give `this.ui.open` a third argument with `enter: 'slash'` and `leave: 'slash'`. A screen's `props` come second; the menu has none, so pass `{}`.

::: details Hint
`this.ui.open(Menu, {}, { enter: 'slash', leave: 'slash' })`.
:::

::: details Solution
<<< @/examples/tutorials/transitions/2-screen.solution.ts{26}
:::

</BlExercise>

`enter` and `leave` need not match: `{ enter: 'zoom', leave: 'fade' }` is common for dialogs. A screen that always opens the same way declares it itself with `useScreen({ enter: 'slash' })`, as the [UI tutorial](./ui)'s menu does.

## Exercise 3: your own transition

<BlExercise src="tutorials/transitions/3-custom">

`defineTransition('wipe-in', { duration, frame, cleanup })` registers an effect by name. `frame(el, t)` is called on every frame with the screen's root element and `t` from 0 (hidden) to 1 (shown), eased; on leave, `t` goes back from 1 to 0. Write `frame` so that the menu is revealed from the left: set `el.style.clipPath` to `inset(0 X% 0 0)`, where `X` goes from 100 when `t` is 0 to 0 when `t` is 1.

::: details Hint
`X` is `(1 - t) * 100`. A template string builds the value: `` `inset(0 ${(1 - t) * 100}% 0 0)` ``. Rename `_el` and `_t` once you use them.
:::

::: details Solution
<<< @/examples/tutorials/transitions/3-custom.solution.ts{9-11}
:::

</BlExercise>

`cleanup` runs when the transition ends, to leave the element as it was. Any CSS property works in `frame`: `opacity`, `transform`, `filter`, masks. The same name also works for scene changes: `{ transition: 'wipe-in' }` in `goto`.

## What you used

| API                                                    | Does                                      |
| ------------------------------------------------------ | ----------------------------------------- |
| `goto(name, params, { transition })`                   | Scene change under a transition           |
| `ui.open / push(Screen, props, { enter, leave })`      | Screen transitions                        |
| `useScreen({ enter, leave })`                          | Transitions declared by the screen itself |
| `defineTransition(name, { duration, frame, cleanup })` | A new transition from a function of `t`   |

Next: [Transitions](../guide/ui-transitions) lists every transition and its options; [Style, layout and motion](../guide/ui-style) animates the inside of screens.
