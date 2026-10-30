# Localization

Translations are JSON files, one per language, in `locales/`. The UI layer finds them in the asset manifest, loads the starting language before the first scene, and switches language at runtime: every `t()` in a screen updates, the root element gets the language's `lang` and text direction, and the choice is saved in settings.

```
locales/
├── en.json
├── ja.json
└── ar.json
```

```json
{
  "menu": { "start": "New game", "quit": "Quit" },
  "greeting": "Welcome back, {name}.",
  "coins": { "=0": "No coins", "one": "{count} coin", "other": "{count} coins" }
}
```

```vue
<script setup lang="ts">
import { t } from '@blacklight/ui';
</script>

<template>
  <h1>{{ t('greeting', { name: player }) }}</h1>
  <p>{{ t('coins', { count: 1200 }) }}</p>
  <!-- also available as $t in every template -->
  <button>{{ $t('menu.start') }}</button>
</template>
```

<LiveExample src="concepts/localization" hint="Left and right switch the language at runtime (Arabic flips the layout); up and down change the plural count." />

## Messages

Keys are dotted paths into the file (`menu.start`). A message is a string, or an object of plural forms chosen with `Intl.PluralRules` from `values.count`: `zero`, `one`, `two`, `few`, `many`, `other` (required), and exact counts `=0`, `=1`… checked first. `{name}` placeholders take the values passed to `t`; numbers are formatted for the language (`1,200`, `1 200`, `١٬٢٠٠`). An unknown placeholder stays as written.

A key missing from the current language comes from the fallback language (`locales.fallback`, `en` by default); a key missing everywhere returns the `fallbackText` argument when given, else the key itself, with one warning: `Missing translation "menu.strat" for "ja". Add it to locales/ja.json.`

| Call                             | Returns                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `t(key, values?, fallbackText?)` | The message, formatted.                                            |
| `useI18n()`                      | The game's `I18n` (also `uiOf(game).i18n`).                        |
| `i18n.locale.value`              | Current language tag (reactive).                                   |
| `i18n.available`                 | Languages with a file, sorted.                                     |
| `await i18n.setLocale('ja')`     | Loads the file and switches; throws for a language without a file. |
| `i18n.dir`                       | `'ltr'` or `'rtl'`.                                                |
| `i18n.number(1200, options?)`    | `Intl.NumberFormat` in the current language.                       |
| `i18n.languageName('ja', true)`  | `日本語` (in its own language), or `Japanese` with `false`.        |
| `i18n.add(lang, messages)`       | Adds messages from code (generated text, tests).                   |

## Starting language

The first language that exists among: the player's saved choice (`ui.locale` in settings), the browser's languages in order (an exact tag, then the same base language: `pt-BR` matches `pt`), `locales.default` of the config, `en`, the first file. Pass `ui({ locale })` to force one.

```ts
// game.config.ts
export default defineConfig({
  // …
  locales: { default: 'en', fallback: 'en' },
});
```

## Ready-made screens

The engine's screens ([settings, pause, save/load](./ui-screens), dialogue buttons, backlog, cutscene) read their texts from `bl.*` keys with English built in. Translate them by adding the same keys to your files; `templates/visual-novel/locales/ja.json` and `ar.json` translate all of them. The full list is `BUILTIN_MESSAGES`, exported by `@blacklight/ui`.

## Japanese, Chinese and Korean

- **Line breaking.** Browsers break Japanese and Chinese between any two characters, which splits words. `<RichText>` (and so the dialogue box) inserts zero-width break opportunities between words found by `Intl.Segmenter` and sets `word-break: keep-all`, so lines break between words; a word longer than the line still breaks (`overflow-wrap: anywhere`). Closing punctuation (`。`, `、`, `」`…) stays with the word before it, and the root uses `line-break: strict` in these languages. `lineBreaks(text, lang)` does the same for your own elements. `t()` returns text unchanged, since a message can be a file name or an id.
- **Fonts.** Release builds subset every font in the game's folders to the characters the game contains: the text of `locales/`, `stories/`, `ui/`, `scenes/`, `objects/`, `modules/`, `.txt` and subtitle files, plus ASCII, Latin-1, general and CJK punctuation and full-width forms. A Japanese font of 5–15 MB usually drops under 1 MB. The build prints each font's size before and after. Name a font `*.full.woff2` (or `.ttf`, `.otf`, `.woff`) to keep it whole, for example the font of a name-entry field; a font that fails to subset is kept whole with a warning.
- **Input.** `TextInput` handles IME composition: the field shows the composition, and the model updates when it is committed.

## Right-to-left languages

For Arabic, Hebrew, Persian, Urdu and the other right-to-left languages (`Intl.Locale` text info, else a list), the UI root gets `dir="rtl"`. Text, flex rows, grids and the CSS logical properties (`inset-inline-start`, `margin-inline-end`, `text-align: start`) follow; the built-in screens use logical properties, so the dialogue name plate moves to the right edge. Absolute `left` / `right` positions do not flip: use logical properties in your screens. Gamepad navigation stays physical (left is left).

## Limits

- Font subsetting only knows the characters in the project's files; text typed by players or fetched at runtime can miss glyphs. Keep such fonts whole (`*.full.*`) or add the characters to a `.txt` file under `assets/`.
- Subsetting reads `.woff2`, `.woff`, `.ttf` and `.otf`; font collections (`.ttc`) are not supported.
- Messages have no ICU syntax (`{count, plural, …}` inside a sentence); use plural objects and placeholders.
- Language files load whole: a game with very large translations loads each language in one request.
