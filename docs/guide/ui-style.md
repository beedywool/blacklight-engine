# Style, layout and motion

Every color, font and skew of the built-in components comes from the active theme, as CSS variables on the UI root. Screens use the same variables, so switching the theme restyles the game's own screens too. Shapes (`Skew`, `Slant`, `Mask`, `NineSlice`), anchors, screen transitions and timelines give menus their motion and Persona-style cuts.

<LiveExample src="concepts/style" hint="Persona-style shapes: Skew, Slant and Mask, brought in by a timeline. Enter replays the timeline." />

## Themes

```ts
// game.config.ts
export default defineConfig({
  // ...
  ui: { theme: 'persona', scale: 1 },
});
```

| Config field | Default        | Meaning                                                                 |
| ------------ | -------------- | ----------------------------------------------------------------------- |
| `ui.theme`   | `'blacklight'` | Theme at the first start. The player's saved choice wins afterwards.    |
| `ui.scale`   | `1`            | UI scale at the first start. The player's saved choice wins afterwards. |

The active theme is chosen at startup from the saved setting `ui.theme`, else the `theme` option of `ui()`, else `ui.theme` from the configuration, else `'blacklight'`. Assigning `runtime.theme` switches live and saves the name in `game.settings`:

```ts
const runtime = useUiRuntime();
runtime.theme = 'blacklight';
```

Assigning an unregistered name throws `Unknown UI theme "...". Themes: blacklight, persona.` A saved or configured name that is not registered when the layer starts does not throw: the layer draws with `blacklight`, logs `UI theme "..." is not registered yet; using "blacklight". Pass it to ui({ themes }).` once, and keeps the name. The root element carries the name in `data-theme`, for rules that only apply to one theme: `.bl-ui[data-theme='persona'] .title { ... }`.

### Theme tokens

| Field               | CSS variable            | Meaning                                                                         |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `name`              | none                    | Name used by `ui.theme` and `runtime.theme`.                                    |
| `colors.background` | `--bl-color-background` | Full-screen backgrounds of menus.                                               |
| `colors.surface`    | `--bl-color-surface`    | Panels, cards, list rows, buttons.                                              |
| `colors.text`       | `--bl-color-text`       | Text.                                                                           |
| `colors.muted`      | `--bl-color-muted`      | Secondary text, focused slider track.                                           |
| `colors.primary`    | `--bl-color-primary`    | Main color: gauge and slider fill, focused row shadow.                          |
| `colors.onPrimary`  | `--bl-color-on-primary` | Text on `primary`.                                                              |
| `colors.accent`     | `--bl-color-accent`     | Second color: text on focused elements, tracks, key caps.                       |
| `colors.focus`      | `--bl-color-focus`      | Background of focused elements.                                                 |
| `colors.danger`     | `--bl-color-danger`     | Danger buttons, gauge trail, error toasts.                                      |
| `colors.scrim`      | `--bl-color-scrim`      | Dim layer behind modal screens.                                                 |
| `fonts.body`        | `--bl-font-body`        | Body text.                                                                      |
| `fonts.display`     | `--bl-font-display`     | Titles, menu rows, buttons.                                                     |
| `fonts.mono`        | `--bl-font-mono`        | Key caps of prompts. Default `ui-monospace, monospace`.                         |
| `sounds`            | none                    | `move`, `confirm`, `back`, `error` asset keys; see [sounds](./ui-focus#sounds). |
| `skew`              | `--bl-skew`             | Skew of the shapes, in degrees. Default `0`.                                    |
| `radius`            | `--bl-radius`           | Corner radius of buttons and dialogs. Default `0px`.                            |
| `tokens`            | `--bl-<key>`            | Extra variables: `{ 'shadow-offset': '8px' }` → `--bl-shadow-offset`.           |

The runtime also sets `--bl-ui-scale` (the player's UI scale), and `--bl-bleed-x` and `--bl-bleed-y`: how far the screen shows past each side of the design area, in virtual pixels. They are `0px` in `letterbox` mode and when the screen has the design's aspect ratio; in `extend` mode a wider screen raises `--bl-bleed-x` and a taller one `--bl-bleed-y`. A shape that must reach the screen's edges (a band across the menu, a backdrop) adds them to its insets; the layer is clipped to the game's canvas, so nothing shows on letterbox bars:

```css
.title__band {
  position: absolute;
  inset: calc(-20% - var(--bl-bleed-y)) 52% calc(-20% - var(--bl-bleed-y))
    calc(-14% - var(--bl-bleed-x));
  transform: skewX(-16deg);
}
```

Components read these variables, with their defaults when unset:

| Variable             | Default | Used by                                       |
| -------------------- | ------- | --------------------------------------------- |
| `--bl-shadow-offset` | `6px`   | Offset shadows of `Skew`, `Slant`, menu rows. |
| `--bl-outline-color` | `#000`  | Text outlines.                                |
| `--bl-outline-width` | `2px`   | Text outlines (`Skew`'s `outline` sets it).   |

### Built-in themes

| Token        | `blacklight`            | `persona`                                                                                                               |
| ------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `background` | `#080808`               | `#e60012`                                                                                                               |
| `surface`    | `#181818`               | `#111111`                                                                                                               |
| `text`       | `#ededed`               | `#ffffff`                                                                                                               |
| `muted`      | `#c2c2c2`               | `#ffb3b8`                                                                                                               |
| `primary`    | `#ffffff`               | `#e60012`                                                                                                               |
| `onPrimary`  | `#080808`               | `#ffffff`                                                                                                               |
| `accent`     | `#303030`               | `#111111`                                                                                                               |
| `focus`      | `#ffffff`               | `#ffffff`                                                                                                               |
| `danger`     | `#f2b8b5`               | `#ffd60a`                                                                                                               |
| `scrim`      | `rgba(0, 0, 0, 0.6)`    | `rgba(0, 0, 0, 0.55)`                                                                                                   |
| fonts        | `system-ui, sans-serif` | body `"Arial Narrow", "Helvetica Neue", Arial, sans-serif`; display `Impact, "Arial Black", "Arial Narrow", sans-serif` |
| `skew`       | `0`                     | `-12`                                                                                                                   |
| `radius`     | `16px`                  | `0px`                                                                                                                   |
| `tokens`     | none                    | `shadow-offset: 8px`                                                                                                    |

Both are exported as `blacklightTheme` and `personaTheme`.

### Custom themes

```ts
import { defineTheme, personaTheme } from '@blacklight/ui';

defineTheme({
  ...personaTheme,
  name: 'night',
  colors: {
    ...personaTheme.colors,
    background: '#0b1026',
    primary: '#3d7bff',
    onPrimary: '#ffffff',
  },
  sounds: { move: 'ui-move', confirm: 'ui-confirm', back: 'ui-back' },
});
```

`defineTheme(theme)` registers a theme (replacing one with the same name) and returns it. A theme that players can pick, or that `ui.theme` names, must be registered before the layer starts, because the saved name is read at startup. Pass it to the plugin:

```ts
import { ui } from '@blacklight/ui';
import night from './ui/themes/night';

ui({ screens, themes: [night] });
```

The CLI's generated entry calls `ui({ screens })` without `themes`, so with it the first game code that can register a theme is the entry scene. The theme registry is reactive: a saved or configured custom name draws as `blacklight` until a scene calls `defineTheme` for it, then the layer redraws with it at once. `themeVariables(theme)` returns the CSS variables of a theme, `getTheme(name)` a registered theme (it throws for others), and `resolveTheme(name)` the theme the layer draws with.

## Shapes

### Skew

A box skewed by the theme's `--bl-skew`, with upright content. Focused (`focusable`) or `active`, it takes the focus colors and grows by 6 %.

```vue
<Skew color="#111" shadow="#e60012" :outline="3">JOKER</Skew>
<Skew focusable @confirm="resume">RESUME</Skew>
```

| Prop        | Default                 | Meaning                                                              |
| ----------- | ----------------------- | -------------------------------------------------------------------- |
| `angle`     | the theme's `--bl-skew` | Skew in degrees.                                                     |
| `active`    | `false`                 | Highlighted state, for a row selected by other means.                |
| `focusable` | `false`                 | Focusable, with `role="button"`; emits `confirm` when clicked.       |
| `color`     | `--bl-color-surface`    | Background color.                                                    |
| `shadow`    | none                    | Color of an offset drop shadow, `--bl-shadow-offset` down and right. |
| `outline`   | none                    | Text outline width in px.                                            |
| `upright`   | `true`                  | Counter-skews the content so text stays straight.                    |

| Event     | When                                    |
| --------- | --------------------------------------- |
| `confirm` | Clicked or confirmed, when `focusable`. |

### Slant

A box with slanted left and right edges, cut with `clip-path`.

```vue
<Slant :left="0" :right="32" color="#e60012" shadow="#000">SKILLS</Slant>
```

| Prop     | Default              | Meaning                                                                                         |
| -------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `left`   | `0`                  | Cut of the left edge in px: positive cuts the top-left corner, negative the bottom-left one.    |
| `right`  | `24`                 | Cut of the right edge in px: positive cuts the bottom-right corner, negative the top-right one. |
| `color`  | `--bl-color-surface` | Background color.                                                                               |
| `shadow` | none                 | Offset drop shadow color.                                                                       |

### Mask

Reveals its content with an animatable `clip-path`.

```vue
<Mask shape="slash" :progress="shown ? 1 : 0" :duration="300"><img :src="portrait" /></Mask>
```

| Prop       | Default        | Meaning                                                                                           |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `shape`    | `'wipe-right'` | `'wipe-right'`, `'wipe-left'`, `'wipe-down'`, `'wipe-up'`, `'diagonal'`, `'circle'`, `'slash'`.   |
| `progress` | `1`            | 0 hidden to 1 fully shown, clamped.                                                               |
| `duration` | `0`            | CSS transition in ms when `progress` changes; `0` to drive `progress` yourself (tween, timeline). |

`wipe-*` reveal from one side, `diagonal` grows a triangle from the top-left corner, `circle` grows from the center, `slash` sweeps a slanted edge from left to right.

### NineSlice

A frame drawn from an image whose corners keep their size, with CSS `border-image`.

```vue
<script setup lang="ts">
import { NineSlice } from '@blacklight/ui';
import frame from '@assets/ui/frame.png';
</script>

<template>
  <NineSlice :src="frame" :slice="24" :border="[24, 32, 24, 32]">Dialogue text</NineSlice>
</template>
```

| Prop     | Default     | Meaning                                                             |
| -------- | ----------- | ------------------------------------------------------------------- |
| `src`    | required    | Image URL.                                                          |
| `slice`  | required    | Insets in image pixels: one number or `[top, right, bottom, left]`. |
| `border` | `slice`     | Drawn border width in virtual pixels, same forms.                   |
| `repeat` | `'stretch'` | How edges fill: `'stretch'`, `'repeat'`, `'round'` or `'space'`.    |

The center of the image fills the box behind the content.

### Outlines and offset shadows

The classes behind `Skew`'s `outline` and `shadow` work on any element:

```vue
<h1 class="bl-outline" style="--bl-outline-width: 6px; --bl-outline-color: #fff">PAUSE</h1>
<div class="bl-skew--shadow" style="--bl-shadow-color: #e60012">Card</div>
```

`bl-outline` draws a text stroke behind the fill (`-webkit-text-stroke` with `paint-order: stroke fill`). `bl-skew--shadow` adds a hard drop shadow (`filter: drop-shadow`) offset by `--bl-shadow-offset` on both axes, which follows the element's clipped shape.

## Anchors and safe area

`Anchor` pins its content to one of nine points of the safe area, for HUDs that must hug the screen edges whatever the aspect ratio.

```vue
<Anchor to="top-left" :offset="[40, 40]"><PartyStatus /></Anchor>
<Anchor to="bottom-right" :offset="[48, 40]"><InputPrompt action="pause" label="MENU" /></Anchor>
```

| Prop     | Default      | Meaning                                                                                                                    |
| -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `to`     | `'top-left'` | `'top-left'`, `'top'`, `'top-right'`, `'left'`, `'center'`, `'right'`, `'bottom-left'`, `'bottom'`, `'bottom-right'`.      |
| `offset` | `[0, 0]`     | Offset in virtual pixels towards the inside of the area. On the middle axis of `top`, `left`, `center`… it is added as is. |
| `safe`   | `true`       | Use the safe area; `false` uses the design area.                                                                           |
| `scaled` | `true`       | Apply the player's UI scale, around the anchor point.                                                                      |

The point of the content that matches `to` is placed on the area's point: `bottom-right` puts the content's bottom-right corner in the area's bottom-right corner. The anchor element lets clicks through; its direct children receive them.

The safe area (`runtime.safeArea`, in virtual pixels) is the visible part of the canvas minus the device's `env(safe-area-inset-*)` insets (notches, rounded corners, system bars). In `extend` mode on a wider screen it extends past the design area, so an anchored HUD reaches the real screen edges. It is updated on every resize. Before the first layout it is empty and anchors use the design area.

## UI scale

Players can enlarge or shrink the HUD:

```ts
useUiRuntime().setScale(1.25);
```

`setScale(value)` clamps to 0.75–1.5 and saves the value in `game.settings` under `ui.scale`. At startup the scale is the saved value, else `ui.scale` from the configuration, else 1, clamped the same way. `runtime.scale` is a `ShallowRef` for sliders.

The scale applies to `Anchor` content (unless `scaled` is `false`). Other screens do not scale by themselves; use `var(--bl-ui-scale)` in their CSS where it matters, for example `transform: scale(var(--bl-ui-scale))`.

## Screen transitions

A screen enters and leaves with named transitions, set in the [screen options](./ui#screen-options) or with `useScreen({ enter, leave })`. Defaults: `fade` in and out, `zoom` in for modals. The table lists the original set; the [transition library](./ui-transitions) adds `iris`, `ink`, `slices` and `shatter`, and every effect also works between scenes.

| Name          | Enter                                                                  | Leave                                          |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------------- |
| `fade`        | Opacity 0 → 1, 180 ms                                                  | Opacity 1 → 0, 120 ms                          |
| `slide-left`  | From 8 % right, fading in, 240 ms                                      | 8 % to the left, fading out, 160 ms            |
| `slide-right` | From 8 % left, fading in, 240 ms                                       | 8 % to the right, fading out, 160 ms           |
| `slide-up`    | From 8 % below, fading in, 240 ms                                      | 8 % up, fading out, 160 ms                     |
| `slide-down`  | From 8 % above, fading in, 240 ms                                      | 8 % down, fading out, 160 ms                   |
| `zoom`        | Scale 1.12 → 1, fading in, 220 ms                                      | Scale 1 → 0.94, fading out, 140 ms             |
| `wipe`        | Revealed from left to right, 300 ms                                    | Hidden from left to right, 220 ms              |
| `slash`       | Cut in on a slanted edge from the left with a skewed overshoot, 320 ms | Cut out to the right on a slanted edge, 220 ms |
| `none`        | At once                                                                | At once                                        |

Enter transitions ease out fast (`cubic-bezier(0.05, 0.7, 0.1, 1)`), leave transitions accelerate (`cubic-bezier(0.3, 0, 0.8, 0.15)`). An unknown name logs a warning with the known names and shows the screen without animation.

`defineTransition(name, { enter, leave })` adds one. Each function receives the screen element and returns a promise that resolves when the animation is over. A promise that rejects ends the transition too, so the screen is never left half in or out; the error is logged once. The example still resolves when an animation is cancelled (the screen closed mid-way), which is not an error:

```ts
import { defineTransition } from '@blacklight/ui';

const done = () => undefined;

defineTransition('drop', {
  enter: (el) =>
    el
      .animate([{ transform: 'translateY(-100%)' }, { transform: 'none' }], {
        duration: 300,
        easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
      })
      .finished.then(done, done),
  leave: (el) =>
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).finished.then(done, done),
});
```

Call it at module level in a screen file or a scene, before a screen uses the name. `transitionNames()` lists the registered names. A transition written this way works for screens only; write it as an [effect](./ui-transitions#your-own-effects) (one `frame` function of progress) to use it between scenes too.

When motion is reduced (the player's [option](./ui-accessibility), else `prefers-reduced-motion: reduce`), built-in transitions skip the animation, and CSS transitions and animations inside the UI are turned off. Promise-based custom transitions check `prefersReducedMotion()` themselves; effects skip automatically.

## Timelines

A timeline places animations, sounds and callbacks on one time line, with labels, and plays them in sync. It is built on [Motion](https://motion.dev).

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MenuList, useTimeline } from '@blacklight/ui';

const backdrop = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const intro = useTimeline()
  .to(backdrop, { x: ['-100%', '0%'] }, { duration: 0.28, ease: [0.05, 0.7, 0.1, 1] })
  .sound('ui-slash', '<')
  .label('content')
  .to('.pause .bl-menu__item', { x: [-120, 0], opacity: [0, 1] }, { at: 'content', duration: 0.18 })
  .to(panel, { y: [60, 0], opacity: [0, 1] }, { at: 'content+0.05', duration: 0.22 });

onMounted(() => void intro.play());
</script>
```

`useTimeline(clock)` creates a `Timeline` and stops it (`'freeze'`) when the component unmounts. Times and durations are in seconds, as in Motion.

| Member                           | Meaning                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `to(target, keyframes, options)` | Animates `target` to `keyframes`. Options: `at`, `duration` (default `0.3`), `ease` (Motion easing name or cubic bezier). |
| `label(name, at?)`               | Names a point: the end of the steps so far, or `at`.                                                                      |
| `call(callback, at?)`            | Runs `callback` at a point.                                                                                               |
| `sound(key, at?)`                | Plays a sound (asset key) on the `ui` bus at a point. A failure logs a warning.                                           |
| `play(from?)`                    | Plays from the start, a label or a time in seconds. Resolves when it ends, is stopped or is interrupted.                  |
| `stop(mode?)`                    | `'freeze'` (default) keeps the current values, `'finish'` jumps to the end, `'revert'` goes back to the start values.     |
| `speed`                          | Playback rate, read when `play` starts: `2` is twice as fast.                                                             |
| `duration`, `playing`            | Total length in seconds; `true` while playing.                                                                            |
| `labelTime(name)`                | Time of a label; throws with the known labels when it does not exist.                                                     |

A target is an element, an array of elements, a template ref (resolved when `play` starts, so call `play` in `onMounted`), or a CSS selector. A selector is resolved against the whole document, not the component: scope it with a class of the screen (`.pause .bl-menu__item`). Keyframes are Motion keyframes: transforms (`x`, `y`, `scale`, `rotate`, `skewX`), `opacity` and CSS properties, as a single target value or a `[from, to]` array.

### Placing steps

| `at`          | Starts                                                   |
| ------------- | -------------------------------------------------------- |
| omitted       | When every `to` step added so far has ended.             |
| `0.5`         | At 0.5 s from the start.                                 |
| `'+0.1'`      | 0.1 s after that end.                                    |
| `'-0.1'`      | 0.1 s before that end (overlap), not before 0.           |
| `'<'`         | With the previous step (`to`, `call` or `sound`).        |
| `'items'`     | At the label `items`.                                    |
| `'items+0.2'` | 0.2 s after the label `items` (`'items-0.2'` before it). |

`call` and `sound` do not move the end point; only `to` steps do. A label may contain `-` or `+`: `'part-2'` is the label `part-2` when it exists, else the label `part` minus 2 s.

### Clocks

`useTimeline('ui')`, the default, runs in real time: menus animate while the game is paused or in slow motion. `useTimeline('game')` advances at each fixed step by the step duration times `speed`, so it stops while the game is paused and slows down with `time.scale`; use it for in-world UI that must stay in sync with gameplay. Cues (`call`, `sound`) fire at the first frame (ui clock) or step (game clock) at or after their time.

### Interruption

`play` stops the same timeline if it was playing. When it starts on an element that another timeline is animating, the other timeline stops where it is, as with `stop('freeze')`: all of its elements, not only the shared ones, keep their current values, its remaining cues do not run, and its `play()` promise resolves. Nothing jumps to an end state. The new steps then start: a step written with `[from, to]` starts from `from`; write a single target value (`{ x: 0 }` rather than `{ x: [-100, 0] }`) to continue from where the interrupted animation left the element, which gives a clean handover when a menu closes during its intro.

### Reduced motion

With `prefers-reduced-motion: reduce`, `play` shows the end state at once, runs the remaining `call` cues in order, skips the `sound` cues, and resolves.

## Limits

- The CLI's generated entry has no way to pass `themes` to `ui()`: with it, a custom theme saved by the player or named in `ui.theme` draws as `blacklight` after a restart.
- The UI scale applies to `Anchor` content only; screens scale through `--bl-ui-scale` in their own CSS.
- Promise-based custom transitions must handle reduced motion themselves (effects do not).
- Timeline selectors search the whole document.
- Timelines animate DOM elements, not Pixi objects; scene objects use [tweens](./time-and-events).
- `wipe`, `slash`, `Mask` and `Slant` use `clip-path`, which also clips focus outlines and shadows drawn outside the box; put shadows on a wrapper (as `Slant` does).
