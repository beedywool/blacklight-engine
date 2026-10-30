# Transitions

One library of transition effects serves three places: screens entering and leaving, scene changes (`goto`), and covers inside a scene (a background change in a visual novel). Every effect is a drawing function of progress, so the same `iris` closes on a scene change and opens a menu.

```ts
// a screen
this.ui.push('PauseMenu', {}, { enter: 'shatter', leave: 'slices' });

// a scene change: the cover closes, the scene switches under it, the cover opens
await this.goto('chapter2', undefined, { transition: 'iris' });

// inside a scene: cover, change something, reveal
await uiOf(this.game).cover('ink', () => this.showBackground('night'));
```

## Effects

| Name          | As a screen (enter / leave)                                              | As a cover (scenes, `cover`)                       | Duration (in) |
| ------------- | ------------------------------------------------------------------------ | -------------------------------------------------- | ------------- |
| `fade`        | Opacity 0 → 1 / 1 → 0                                                    | Black fades in, then out                           | 180 ms        |
| `slide-left`  | From 8 % right, fading in / 8 % to the left, fading out                  | Slides in and out                                  | 240 ms        |
| `slide-right` | Mirror of `slide-left`                                                   | Slides in and out                                  | 240 ms        |
| `slide-up`    | From 8 % below / 8 % up                                                  | Slides in and out                                  | 240 ms        |
| `slide-down`  | From 8 % above / 8 % down                                                | Slides in and out                                  | 240 ms        |
| `zoom`        | Scale 1.12 → 1, fading in / scale 1 → 0.94, fading out                   | Zooms in and out                                   | 220 ms        |
| `wipe`        | Revealed from left to right / hidden from left to right                  | Black sweeps in from the left, leaves to the right | 300 ms        |
| `slash`       | Cut in on a slanted edge with a skewed overshoot / cut out to the right  | Slanted edge sweeps across                         | 320 ms        |
| `iris`        | A circle opening from the center                                         | A hole closing on the center, then opening         | 450 ms        |
| `ink`         | Ink blots spreading until they cover the screen                          | The same, black                                    | 600 ms        |
| `slices`      | Seven horizontal bands sliding in from alternate sides                   | The same, black                                    | 420 ms        |
| `shatter`     | The screen assembles from 24 glass shards / breaks into them             | Black shards fly in, then apart                    | 500 ms        |
| `distort`     | (scenes only) the picture waves and splits red/blue while black fades in | see [FX layer](./ui-fx)                            | 500 ms        |
| `none`        | At once                                                                  | At once                                            | —             |

Leaving takes 75 % of the entering time. Enter progress eases out fast (`cubic-bezier(0.05, 0.7, 0.1, 1)`), leave progress accelerates (`cubic-bezier(0.3, 0, 0.8, 0.15)`). Effects run in real time, so a menu animates while the game is paused. The random-looking shapes of `ink` and `shatter` come from a fixed seed: the same transition looks the same every time (screenshot tests).

Defaults are unchanged from the [UI layer](./ui#screen-options): screens use `fade`, modals enter with `zoom`. An unknown screen transition logs a warning with the known names and shows the screen without animation; an unknown scene transition throws `Unknown scene transition "irs". Did you mean "iris"? Known: none, fade, …`.

## Examples

Each example opens a menu with the effect, closes it, then changes scene under the same effect, and loops. `distort` exists for scene changes only. Edit `TRANSITION` to compare effects, or the timings in `create()`.

### fade

<LiveExample src="transitions/fade" hint="Menu enter and leave, then a scene change." />

### slide-left

<LiveExample src="transitions/slide-left" hint="Menu enter and leave, then a scene change." />

### slide-right

<LiveExample src="transitions/slide-right" hint="Menu enter and leave, then a scene change." />

### slide-up

<LiveExample src="transitions/slide-up" hint="Menu enter and leave, then a scene change." />

### slide-down

<LiveExample src="transitions/slide-down" hint="Menu enter and leave, then a scene change." />

### zoom

<LiveExample src="transitions/zoom" hint="Menu enter and leave, then a scene change." />

### wipe

<LiveExample src="transitions/wipe" hint="Menu enter and leave, then a scene change." />

### slash

<LiveExample src="transitions/slash" hint="Menu enter and leave, then a scene change." />

### iris

<LiveExample src="transitions/iris" hint="Menu enter and leave, then a scene change." />

### ink

<LiveExample src="transitions/ink" hint="Menu enter and leave, then a scene change." />

### slices

<LiveExample src="transitions/slices" hint="Menu enter and leave, then a scene change." />

### shatter

<LiveExample src="transitions/shatter" hint="Menu enter and leave, then a scene change." />

### distort

<LiveExample src="transitions/distort" hint="Scene changes only." />

### none

<LiveExample src="transitions/none" hint="Menu enter and leave, then a scene change." />
## Between scenes

Installing `@blacklight/ui` registers every effect in `game.transitions`, the map core's `goto` reads names from. A scene transition then draws a full-screen element (`.bl-cover`) above the canvas and every screen, so HUDs disappear under the cover with the scene. Without the UI package only core's `fade`, drawn on the canvas, exists.

```ts
import { coverTransition, uiOf } from '@blacklight/ui';

// A red iris, a little slower.
this.game.transitions.set(
  'red-iris',
  coverTransition(uiOf(this.game).element, 'iris', { color: '#e60012', duration: 700 }),
);
await this.goto('battle', undefined, { transition: 'red-iris' });
```

| `coverTransition` option | Default                     | Meaning                                          |
| ------------------------ | --------------------------- | ------------------------------------------------ |
| `color`                  | `'#000'`                    | Cover color (any CSS background).                |
| `duration`               | 1.4 × the effect's duration | Milliseconds for each half (cover, then reveal). |

`uiOf(game).cover(name, during, options)` plays the same cover inside a scene: it closes, awaits `during()`, then opens, and resolves at the end. It takes the same `color` and `duration` options and throws on an unknown name.

## Your own effects

An effect is an object with a `frame(element, t, info)` function. `t` goes from 0 (hidden) to 1 (shown), already eased; set inline styles on the element. `info` holds the element's layout `width` and `height` in virtual pixels, the `direction` (`in` when appearing, `out` when disappearing) and `cover` (`true` when the element is a full-screen cover rather than a screen).

```ts
import { defineTransition } from '@blacklight/ui';

defineTransition('blinds', {
  duration: 0.4,
  frame(el, t) {
    el.style.clipPath = `inset(0 0 ${(1 - t) * 100}% 0)`;
  },
});
```

<LiveExample src="transitions/custom" hint="A twelve-band blinds effect, on a screen and on a scene change." />

| Field      | Default                                                   | Meaning                                           |
| ---------- | --------------------------------------------------------- | ------------------------------------------------- |
| `frame`    | required                                                  | Draws the element at progress `t`.                |
| `duration` | `0.3`                                                     | Seconds to appear; disappearing takes 75 % of it. |
| `cleanup`  | removes `clip-path`, `mask-image`, `transform`, `opacity` | Called at the end; remove anything `frame` added. |

A transition defined after the UI layer started is registered for scenes too. `playEffect(effect, element, from, to, direction, cover)` plays an effect on any element (a panel inside a screen); `getEffect(name)` returns a registered effect and `effectNames()` lists them.

`defineTransition(name, { enter, leave })` with two promise-returning functions still works for screens (see [style](./ui-style#screen-transitions)); such transitions cannot be used between scenes because they have no progress to draw.

## Reduced motion

When motion is reduced (the player's [accessibility option](./ui-accessibility), else `prefers-reduced-motion`), screen effects jump to the end and scene covers fade instead of drawing their shape. Custom effects get this for free: `frame` is not called.

## Limits

- `shatter` clones the screen element 24 times for its duration: content that is not in the DOM (a `<canvas>`, a playing `<video>`) shows blank in the shards, and very large screens cost a frame or two to clone.
- `wipe`, `slash`, `iris` and `slices` use `clip-path`, `ink` and the `iris` cover use `mask-image`: shadows and focus outlines outside the element are clipped too.
- Covers are drawn in the DOM, not with shaders; `distort` is the transition that goes through the [FX layer](./ui-fx).
- A scene transition's progress is driven by core in real time; a slow scene load happens while the screen is covered, so the cover stays closed until the next scene's `create()` returns.
