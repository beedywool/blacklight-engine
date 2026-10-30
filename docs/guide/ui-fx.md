# FX layer

Shaders cannot read the pixels of DOM elements (limitation L1). The FX layer gives screens WebGL effects anyway, in two places: on the game canvas under the UI (the scene behind a pause menu blurs), and on a second canvas above the UI where `<PixiRender>` redraws a component so it can go through a shader (a glitching logo). Effects follow the screens that use them: they fade in when the screen opens and out when it closes.

```vue
<script setup lang="ts">
import { PixiRender, useFx } from '@blacklight/ui';

// The scene behind this menu blurs while the menu is open.
useFx('blur', { strength: 0.6 });
</script>

<template>
  <PixiRender :fx="['glitch']" :strength="0.3">
    <h1 class="logo">NEON RAIN</h1>
  </PixiRender>
</template>
```

```ts
// From a scene: one glitch pulse, then a lasting halftone.
const fx = uiOf(this.game).fx;
await fx.pulse('glitch', { duration: 600 });
const print = fx.add('halftone', { strength: 0.4, fade: 300 });
await print.remove(300);
```

<LiveExample src="concepts/fx" hint="The FX layer: Enter cycles the lasting effect on the game, Space fires a glitch pulse. The title over the UI goes through a shader too (PixiRender)." />

## Effects

| Name        | Look                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `glitch`    | Horizontal bands jump sideways several times a second, with a red/blue split.                    |
| `halftone`  | Comic-print dots at 45°, each sized by the darkness of the picture under it.                     |
| `blur`      | Gaussian blur, up to 12 px at strength 1 (Pixi's `BlurFilter`).                                  |
| `chromatic` | Red and blue pushed apart from the center, more toward the edges.                                |
| `distort`   | Waves through the picture; with `chromatic`, the `distort` [scene transition](./ui-transitions). |

Every effect takes a `strength` from 0 (none) to 1 (full); higher values exaggerate. Animated effects (`glitch`, `distort`) advance with the displayed frames, also while the game is paused. Any Pixi `Filter` can be passed instead of a name; a filter without `strength` is enabled while its strength is above 0. `createFxFilter(name)` builds one for your own Pixi objects, and `FX_SHADERS` holds the GLSL sources.

## API

| Call                                 | Meaning                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `uiOf(game).fx.add(effect, options)` | Adds an effect; returns a handle.                                                        |
| `fx.pulse(effect, options)`          | Fades in over a quarter of `duration` (600 ms), holds, fades out; resolves when removed. |
| `fx.clear()`                         | Removes every effect at once.                                                            |
| `fx.active`                          | Handles of the effects in place.                                                         |
| `await fx.overlay()`                 | The canvas above the UI (`{ app, stage }`), created on first use.                        |
| `useFx(effect, options)`             | In a component: added on mount (fade 250 ms), removed on unmount (fade 200 ms).          |

| Option     | Default   | Meaning                                                                         |
| ---------- | --------- | ------------------------------------------------------------------------------- |
| `strength` | `1`       | Final strength.                                                                 |
| `fade`     | `0`       | Fade-in, ms of real time.                                                       |
| `target`   | `'world'` | `'world'`: the game canvas (every scene). `'overlay'`: the canvas above the UI. |

A handle has `strength` (set it any time), `fadeTo(strength, ms)` and `remove(fadeMs?)`; both resolve when done. Reduced motion makes fades instant.

## PixiRender

`<PixiRender>` draws its slot into a texture shown on the overlay canvas, exactly over the original, and hides the original with `opacity: 0`. The DOM content stays where it is: it keeps the focus, clicks, hover and input; only its picture goes through the shaders.

| Prop       | Default | Meaning                                                             |
| ---------- | ------- | ------------------------------------------------------------------- |
| `fx`       | `[]`    | Effects (names or filters) applied to the drawn content.            |
| `strength` | `1`     | Strength of the built-in effects; can change.                       |
| `live`     | `true`  | Redraw when the content changes (text, attributes, focus, classes). |
| `fps`      | `30`    | Most redraws per second while the content changes.                  |

| Event      | When                                                           |
| ---------- | -------------------------------------------------------------- |
| `rendered` | The first texture is on screen.                                |
| `fallback` | Drawing failed; the DOM content stays visible without effects. |

The element has `data-bl-pixi-render` set to `pending`, `rendered` or `fallback`. Drawing works by copying the element with its computed styles inline, embedding its images as data URLs, wrapping it in an SVG `foreignObject` and decoding that SVG as an image at the screen's resolution (`drawElement` and `snapshotSvg` are exported). The sprite follows the element's position every frame, so moving screens and scrolling work.

## Limits

- PixiRender is for small, mostly static components (logos, titles, a card). Each change redraws the whole element through an SVG image: text that changes every frame costs a redraw each time, capped by `fps`.
- Web fonts loaded by the page are not available inside the SVG image: the drawn copy falls back to system fonts unless the font is installed. Use system fonts in rendered components, or accept the substitution.
- Pseudo-elements (`::before`, `::after`), `<canvas>`, `<video>`, `<iframe>` and cross-origin images without CORS are not drawn.
- Transforms on ancestors (rotation, skew of a parent) are not reproduced: the sprite covers the element's bounding box; transforms on the element itself and its children are.
- Safari and older WebKit refuse to draw `foreignObject` SVG into a canvas used by WebGL; the component then falls back to its DOM version (`fallback` event).
- Effects are GLSL shaders for the WebGL renderer; with WebGPU they are skipped with one warning.
- The overlay is a second WebGL context, created only when `<PixiRender>` or an `overlay` effect is used.
- `world` effects filter the whole game canvas, every scene and split-screen view together.
