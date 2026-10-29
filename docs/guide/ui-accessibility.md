# Accessibility

The player's accessibility options live in one reactive object, `accessibility`, saved in settings (`a11y.*`) and applied by the UI layer at once: text size, contrast, color-blind filters, reduced motion, subtitles and text speed. The ready-made [settings screen](./ui-screens#settings) has a tab for all of them; games can also set them from code.

```ts
import { accessibility } from '@blacklight/ui';

accessibility.textScale = 1.25;
accessibility.colorFilter = 'deuteranopia';
accessibility.reducedMotion = 'on';
```

| Option               | Default    | Effect                                                                                                                                       |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `textScale`          | `1`        | 0.8–2. Multiplies `--bl-text-scale`, used by rich text, dialogue, the backlog, subtitles and floating texts.                                 |
| `contrast`           | `'normal'` | `'high'`: darker modal backdrop, muted text at full color, a dark outline around text, solid dialogue and subtitle boxes, a 4 px focus ring. |
| `colorFilter`        | `'none'`   | `'protanopia'`, `'deuteranopia'`, `'tritanopia'` (daltonization) or `'grayscale'`, applied to the whole game: canvas and UI.                 |
| `reducedMotion`      | `'system'` | `'system'` follows `prefers-reduced-motion`; `'on'` / `'off'` override it.                                                                   |
| `subtitles`          | `true`     | Show subtitles of videos and of `subtitle()`.                                                                                                |
| `subtitleSize`       | `1`        | 0.75–2, multiplies the subtitle font size.                                                                                                   |
| `subtitleBackground` | `0.6`      | Opacity of the box behind subtitles, 0–1.                                                                                                    |
| `textSpeed`          | `45`       | Typewriter characters per second; `0` shows text at once.                                                                                    |

The object is the same as `uiOf(game).accessibility`. Values are read from settings when the UI layer starts; a saved value of the wrong type is replaced by the default.

## In your screens

- **Text size.** Write font sizes of long text as `calc(32px * var(--bl-text-scale))`. Menus with fixed layouts can keep fixed sizes.
- **Contrast.** The root has `data-contrast="high"`; add rules under `.bl-ui[data-contrast='high']` for your own panels.
- **Reduced motion.** The root has `data-reduced-motion`, which turns off CSS transitions and animations inside the UI. Screen transitions, timelines, the typewriter, rich-text effects, FX fades and floating texts check `prefersReducedMotion()`, exported for your code.

## Color filters

Daltonization simulates the missing cone response in LMS space and moves the lost difference into channels the player still sees (Fidaner, Lin and Ozguven); the whole pipeline is linear, so it folds into one 3×3 matrix (`colorFilterMatrix(filter)`) applied as an SVG `feColorMatrix` CSS filter on the game's mount element. Grays stay gray. The matrix is also usable in a shader.

## Subtitles

Videos show their subtitle file ([video](./ui-video)); voice barks and radio lines use `subtitle(text, options)`, drawn at the bottom of the screen above every screen. Both follow `subtitles`, `subtitleSize` and `subtitleBackground`.

```ts
const radio = this.audio.play('radio_01', { bus: 'voice' });
subtitle('Bravo team, move in.', { speaker: 'Radio', until: radio.ended });
```

| Option     | Default | Meaning                                             |
| ---------- | ------- | --------------------------------------------------- |
| `speaker`  | none    | Bold name before the text.                          |
| `duration` | `3000`  | Lifetime in ms.                                     |
| `until`    | none    | A promise that ends the line instead of `duration`. |

`subtitle()` returns a function that removes the line early.

## Limits

- The color filter is a CSS filter over the whole page area of the game: it costs GPU time on low-end phones, and screenshots taken through `renderer.extract` do not include it.
- Daltonization improves contrast between confusable colors; it does not restore them. Design with shapes and labels too.
- `textScale` does not scale menus with fixed layouts; use the [UI scale](./ui-style#ui-scale) for that.
- Screen readers: screens are plain HTML with roles on widgets, but there is no dedicated screen-reader mode.
