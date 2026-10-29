# Rich text

`<RichText>` displays text with inline markup: colors, sizes, shaking and waving letters, icons, input glyphs, and typewriter speed and pauses. The markup is the TextMeshPro style that Ink writers already use, so dialogue lines carry it unchanged.

```vue
<script setup lang="ts">
import { RichText } from '@blacklight/ui';
</script>

<template>
  <RichText
    text="Press <input=confirm> to <wave>dance</wave>. <color=danger>Careful</color><pause=400>..."
    :typewriter="true"
    @done="ready = true"
  />
</template>
```

## Tags

| Tag                    | Effect                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `<color=X>…</color>`   | Text color. `X` is a theme color (`primary`, `accent`, `danger`, `muted`, `text`…), a CSS color name, `#e60012` or `e60012`. |
| `<size=X>…</size>`     | Font size: a number is a multiple of the current size (`1.5`), or any CSS size (`48px`, `150%`).                             |
| `<b>`, `<i>`, `<u>`    | Bold, italic, underline.                                                                                                     |
| `<wave>`, `<wave=2>`   | Letters bob up and down one after the other; the number scales the height.                                                   |
| `<shake>`, `<shake=2>` | Letters tremble; the number scales the distance.                                                                             |
| `<speed=X>…</speed>`   | Typewriter speed multiplier inside the span (`0.5` is half speed). Nested spans multiply.                                    |
| `<pause=X>`            | The typewriter waits `X` ms (`<pause=0.5s>` in seconds).                                                                     |
| `<icon=name>`          | An inline image: a name registered with `defineIcon(name, url)`, else the image asset of that name.                          |
| `<input=action>`       | The [input prompt](./ui-focus#input-prompts) of an action, following the device and rebinding.                               |

`\<` writes a literal `<`. An unknown tag (`<blink>`) or a closing tag without its opening tag stays in the text as written, so a typo shows on screen instead of disappearing. Newlines are kept. In an Ink file, `#` starts a tag: write colors by name or as `e60012`, or escape it as `\#`.

`parseRichText(text)` returns the parsed runs and `plainText(text)` the text without markup (search, accessibility labels, timing).

## Typewriter

| Prop         | Default     | Meaning                                                                                                                                                                      |
| ------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`       | required    | Text with tags.                                                                                                                                                              |
| `typewriter` | `false`     | `true`: reveal at the player's text speed ([accessibility](./ui-accessibility), 45 characters per second by default). A number: characters per second. `false`: all at once. |
| `paused`     | `false`     | Stops revealing where it is.                                                                                                                                                 |
| `appear`     | `'none'`    | Per-character entrance while typing: `'fade'` or `'rise'`.                                                                                                                   |
| `lang`       | UI language | Language of the text, for line breaking.                                                                                                                                     |
| `blip`       | none        | Sound played on the `ui` bus while typing (a short "blip" asset).                                                                                                            |
| `blipEvery`  | `2`         | Characters between two blips.                                                                                                                                                |

| Event         | When                                                              |
| ------------- | ----------------------------------------------------------------- |
| `done`        | Every character is visible (at once when there is no typewriter). |
| `char(index)` | A character (or icon) became visible.                             |

The component exposes `skip()` (show the rest now), `restart()` and `finished`. Hidden characters keep their place (`visibility: hidden`), so lines never reflow while typing. Characters are user-perceived characters (`Intl.Segmenter` graphemes): an emoji or a letter with an accent appears at once. Zero-width line-break marks take no time. The typewriter runs on the real-time clock; a player text speed of 0, or reduced motion, shows the text at once.

## Per-character animation

`<wave>` and `<shake>` put each character in its own `inline-block` element (`.bl-rt-ch`, with its index in `--i`) animated by CSS keyframes with a per-character delay; `appear` does the same for every character. Style them with your own keyframes:

```css
.my-line .bl-rt-ch:not(.bl-rt-hidden) {
  animation: pop 0.2s ease-out both;
}
```

Reduced motion turns these animations off.

## Limits

- Scripts whose letters join (Arabic, Syriac, N'Ko, Mongolian) are never split into per-character elements, which would break the joining: `<wave>`, `<shake>` and `appear` show them as plain text.
- Text inside `<RichText>` cannot contain HTML; tags are the list above.
- `<size>` and `<icon>` change line heights; a line may grow while it types when an icon appears.
