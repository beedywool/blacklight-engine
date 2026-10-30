# Dialogue

Stories are written in [Ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md) and played by the inkjs runtime. `Dialogue` wraps a story: lines with speakers, choices, variables and conditions, tags that drive portraits, sounds, transitions and rich text, a backlog, read-line tracking for skip mode, and a JSON state for saves. `<DialogueBox>` shows it: name plate, typewriter, portraits, choices, and the AUTO / SKIP / LOG / SAVE / LOAD / MENU buttons. `templates/visual-novel` is a complete game built on them.

```text
// stories/main.ink
VAR player = "Aoi"
VAR trust = 0

mira: There you are, <color=primary>{player}</color>. # portrait: mira happy left # voice: mira_01
mira: Then listen<pause=400>... <wave>the city is singing tonight.</wave>
* [Follow Mira]
  ~ trust = trust + 1
  -> rooftop
* {trust > 2} [Tell the truth]
  -> END
```

```ts
// scenes/story/story.scene.ts
import { Scene } from '@blacklight/core';
import { Dialogue } from '@blacklight/ui';
import story from '@stories/main.ink';

export default class Story extends Scene {
  dialogue!: Dialogue;

  override create() {
    this.dialogue = new Dialogue(story, { game: this.game });
    this.dialogue.events.on('tag', ({ tag }) => {
      if (tag.name === 'bg') this.showBackground(tag.value);
    });
    this.dialogue.events.on(
      'end',
      () => void this.goto('title', undefined, { transition: 'shatter' }),
    );
    this.dialogue.start(undefined, { player: 'Aoi' });
    this.ui.open('StoryScreen', { dialogue: this.dialogue });
  }
}
```

```vue
<!-- scenes/story/ui/StoryScreen.vue -->
<script setup lang="ts">
import { Backlog, DialogueBox, useUi, type Dialogue } from '@blacklight/ui';

defineProps<{ dialogue: Dialogue }>();
const ui = useUi();
</script>

<template>
  <DialogueBox :dialogue="dialogue" @backlog="ui.push(Backlog, { dialogue })" />
</template>
```

<LiveExample src="concepts/dialogue" hint="An Ink dialogue: Enter advances (or completes the line), arrows pick a choice. Edit the speakers below." />

## Ink files

`.ink` files under `stories/` (alias `@stories`) are imported as modules: the CLI compiles them with the inkjs compiler at dev and build time, so games ship the compiled JSON, not the compiler or the source. `INCLUDE` works, and editing an included file reloads the story. Compile errors stop the build with the file and line: `Ink errors in stories/main.ink: ERROR: line 2: Expected closing ']' …`. TypeScript needs one declaration in the game (the templates ship it as `env.d.ts`):

```ts
declare module '*.ink' {
  const story: object;
  export default story;
}
```

`new Dialogue(json)` also accepts the JSON produced by inklecate or Inky, as an object or a string.

## Lines and speakers

A line `mira: Hello.` has the speaker `mira` and the text `Hello.`; a `# speaker: mira` tag does the same without the prefix. Lines without either are narration. The box shows `t('speakers.<id>')` in the name plate (so speaker names are translated in `locales/`), the id itself when there is no translation, or the `speakers` prop:

```vue
<DialogueBox :dialogue="dialogue" :speakers="{ mira: { name: 'Mira', color: '#e60012' } }" />
```

Line text can use every [rich-text tag](./ui-rich-text).

## Tags

Ink tags (`# name: value`, `# name value` or `# name`) on a line apply when it shows. Tags on lines of their own apply to the next line; tag-only lines at the end of a section still apply.

| Tag                                                                   | Effect                                                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `portrait: <character> <expression> [pos]`                            | Shows or changes a portrait; `pos` is `left`, `center` or `right` (default: the first free place). `portrait: none` clears. |
| `expression: <expression>`                                            | Changes the expression of the speaker's portrait.                                                                           |
| `hide: <character>`, `clear`                                          | Removes one portrait, or all.                                                                                               |
| `voice: <asset>`                                                      | Plays a voice line on the `voice` bus; it stops at the next line and auto mode waits for it.                                |
| `sfx: <asset>`                                                        | Plays a sound on the `sfx` bus.                                                                                             |
| `music: <asset>`, `music: stop`                                       | Changes the music with a 600 ms crossfade.                                                                                  |
| `color: <color>`, `size: <size>`, `speed: <x>`, `effect: shake\|wave` | Wraps the whole line in that rich-text tag.                                                                                 |
| anything else                                                         | Emitted as a `tag` event for the scene: backgrounds, `transition: iris`, `fx: glitch`, gallery unlocks…                     |

Sounds named in tags load on first use when no scene preloaded them, so a long story does not preload every voice file. Portrait images are looked up as image assets named `<character>-<expression>` (then `<character>_<expression>`, then `<character>`); pass `portrait(character, expression)` to the box to choose URLs yourself. The speaking character is drawn at full brightness, the others dimmed.

The visual-novel template handles `bg` (redraws the background), `transition` (the next `bg` changes under a [cover](./ui-transitions#between-scenes)), `fx` (a one-shot [FX](./ui-fx) pulse) and `unlock` (a gallery image) in its scene.

## Choices, variables and conditions

Choices are what Ink offers at that point; conditions (`* {trust > 2} [Tell the truth]`) are evaluated by Ink, so a hidden choice never reaches the box. The box shows them as focusable buttons, the first one focused; `dialogue.choose(index)` picks one from code.

```ts
dialogue.vars.player = 'Ren';        // write an Ink variable
if (Number(dialogue.vars.trust) > 2) { … } // read one (values are unknown: Ink types)
dialogue.observe('trust', (value) => …);
dialogue.bind('play_sound', (name) => this.audio.play(String(name))); // EXTERNAL play_sound(name)
dialogue.jump('chapter2.intro');     // go to a knot or stitch
```

`start(path?, vars?)` resets the story (Ink resets its variables) and sets `vars` before the first line, for values chosen before the story starts, like a typed name.

| Member          | Meaning                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `line`          | Current line `{ text, speaker, tags, voice, id }`, `null` between lines. |
| `choices`       | Choices offered now.                                                     |
| `ended`         | The story reached its end.                                               |
| `next()`        | Shows the next line; `false` when choices are pending or at the end.     |
| `choose(index)` | Picks a choice; throws for an index that is not offered.                 |
| `events`        | `line`, `choices`, `tag`, `end`.                                         |
| `view`          | Reactive `{ line, choices, backlog, portraits, ended }` for components.  |
| `story`         | The inkjs `Story`, for anything else.                                    |

## The box

| Prop         | Default    | Meaning                                                        |
| ------------ | ---------- | -------------------------------------------------------------- |
| `dialogue`   | required   | The `Dialogue` to show.                                        |
| `speakers`   | none       | Display names (and name plate colors) by speaker id.           |
| `portrait`   | assets     | `(character, expression) => url`.                              |
| `quickMenu`  | `true`     | Shows the AUTO / SKIP / LOG / SAVE / LOAD / MENU buttons.      |
| `autoDelay`  | `900`      | Pause after a line in auto mode, ms, plus 30 ms per character. |
| `skipUnread` | `false`    | Skip mode also skips lines never read.                         |
| `mode`       | `'normal'` | `'normal'`, `'auto'` or `'skip'` (`v-model:mode`).             |
| `blip`       | none       | Typing sound for lines without a voice.                        |

| Event                             | When                                 |
| --------------------------------- | ------------------------------------ |
| `backlog`, `save`, `load`, `menu` | The quick-menu button was used.      |
| `end`                             | The player moved past the last line. |

Confirm (or a click) on the box finishes a typing line, then shows the next one. In auto mode the next line comes after the voice line ends and `autoDelay` passes. Skip mode shows lines at once, one every 70 ms, and stops at choices and at the first line the player has never read (read lines are remembered across playthroughs in settings, `dialogue.read`). Holding Ctrl skips; the mouse wheel up emits `backlog`. The box has `data-mode` and, while a line types, `data-typing`.

## Backlog

`<Backlog :dialogue>` is a screen listing every line and picked choice (choices marked with `›`), newest at the bottom and focused; confirm on a line replays its voice. It keeps the last 200 entries (`backlogSize`).

## Saving mid-dialogue

`dialogue.state()` returns JSON: Ink's own state (variables, visit counts, position), the line on screen, pending choices, the backlog and the portraits. Put it in your save; `dialogue.restore(state)` shows the same line again with its portraits and backlog, without replaying its sounds. A state from a different story version throws `The saved dialogue does not match this story … Was the .ink file changed since the save?`.

```ts
const save = { dialogue: dialogue.state(), background: this.background };
// later
dialogue.restore(save.dialogue);
```

The [save/load screen](./ui-screens#save-and-load) stores it through any `SaveSlots`.

## Several languages

Pass one story per language and the dialogue plays the one of `locale` (exact tag, then base language, then the first):

```ts
import ar from '@stories/ar/main.ink';
import en from '@stories/en/main.ink';
import ja from '@stories/ja/main.ink';

const dialogue = new Dialogue(
  { en, ja, ar },
  { game: this.game, locale: uiOf(this.game).i18n.locale.value },
);
watch(uiOf(this.game).i18n.locale, (lang) => dialogue.setLocale(lang));
```

`setLocale` moves the Ink state to the other story, so the translations must keep the same knots, stitches, choices and variables; the next line comes in the new language. Speaker ids stay the same in every language (`mira:`); names come from the locale files.

## Limits

- Ink's own `#` tags cannot hold `#`: write colors by name or without `#` (`<color=e60012>`), or escape them (`\#`).
- The speaker prefix is recognized for ids of up to 40 characters without `:`, `<`, `>`, `#`, `{` or `}`; anything else is narration (use `# speaker:`).
- Read-line tracking hashes the story position and the text: editing a line marks it unread.
- Ink threads and multiple flows are available through `dialogue.story` but the box shows the main flow only.
