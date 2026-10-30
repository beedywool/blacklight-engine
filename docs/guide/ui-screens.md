# Ready-made screens

Settings, a pause menu and save/load slots, styled by the active theme and translated through `bl.*` [locale keys](./ui-localization#ready-made-screens). Push them like any screen component.

```ts
import { PauseScreen, SettingsScreen } from '@blacklight/ui';

// in a scene
if (this.input.pressed('pause')) this.ui.push(PauseScreen, { slots });
// in a title screen
ui.push(SettingsScreen);
```

<LiveExample src="concepts/ready-screens" hint="Ready-made screens: Escape opens the pause menu (it pauses the game; Settings, Save and Load work), Enter opens the settings directly." />

## Settings

`SettingsScreen` has five tabs, switched with the tab buttons or `tabLeft` / `tabRight`. Every change applies at once and is saved.

| Tab           | Contents                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audio         | A volume slider per bus: master, music, sound effects, voice, interface.                                                                                                                    |
| Video         | Full screen (Fullscreen API), [UI scale](./ui-style#ui-scale), theme (when several are registered).                                                                                         |
| Controls      | Every action with its current [prompt](./ui-focus#input-prompts); confirm, then press a key, mouse button or pad button to rebind (Escape cancels). Reset restores the configured bindings. |
| Language      | The languages of `locales/`, each in its own language with the current language's name beside it. Hidden with fewer than two.                                                               |
| Accessibility | Text size, text speed, high contrast, color filter, reduced motion, subtitles, subtitle size and background ([accessibility](./ui-accessibility)).                                          |

| Prop      | Default                                         | Meaning                                                                            |
| --------- | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| `tabs`    | all five, in this order                         | Tabs to show: `'audio'`, `'video'`, `'controls'`, `'language'`, `'accessibility'`. |
| `actions` | every action except directions and tab switches | Actions listed on the controls tab.                                                |
| `buses`   | `['master', 'music', 'sfx', 'voice', 'ui']`     | Buses on the audio tab.                                                            |

Action names come from `t('actions.<name>')`, else the name in capitals.

## Pause menu

`PauseScreen` pauses the game logic while it is open (`game.pause()`, resumed on close) and lists:

| Item         | Shown when       | Does                                                                                             |
| ------------ | ---------------- | ------------------------------------------------------------------------------------------------ |
| Resume       | always           | Closes with `'resume'` (also on `back` and `pause`).                                             |
| Settings     | always           | Pushes `SettingsScreen`.                                                                         |
| Save, Load   | `slots` is given | Pushes `SaveLoadScreen`; a load closes the menu with `'loaded'`.                                 |
| Title screen | always           | Asks, then goes to `titleScene` (the entry scene by default) with `fade`; closes with `'title'`. |
| Quit game    | not on the web   | Asks, then `game.platform.quit()`.                                                               |

| Prop         | Default                                                   | Meaning                                                    |
| ------------ | --------------------------------------------------------- | ---------------------------------------------------------- |
| `items`      | `['resume', 'settings', 'save', 'load', 'title', 'quit']` | Entries and their order.                                   |
| `slots`      | none                                                      | Save slots for Save and Load.                              |
| `meta`       | none                                                      | `() => SaveSlotMeta`: details stored with saves made here. |
| `titleScene` | `config.entry`                                            | Scene of the title screen.                                 |
| `pauseGame`  | `true`                                                    | Pause the game logic while open.                           |

## Save and load

`SaveLoadScreen` lists slots `1`…`count` in a grid, filled ones with their thumbnail, label, summary, date (in the current language) and play time; in load mode, other filled slots (`auto`, `quick`) come first. Saving over a slot and loading ask first; the `action` button deletes the focused save after confirmation. It closes with `'saved'`, `'loaded'` or nothing.

| Prop    | Default  | Meaning                         |
| ------- | -------- | ------------------------------- |
| `mode`  | required | `'save'` or `'load'`.           |
| `slots` | required | Any `SaveSlots` implementation. |
| `count` | `8`      | Numbered slots shown.           |
| `meta`  | none     | Details stored with a new save. |

The screen talks to the save system through a small interface, so it works with `game.save`, a cloud service or a test double:

```ts
interface SaveSlots {
  list(): Promise<SaveSlotInfo[]>; // filled slots
  save(id: string, meta: SaveSlotMeta): Promise<void>; // write the current game
  load(id: string): Promise<void>; // restore it (usually goto a scene)
  delete(id: string): Promise<void>;
}

interface SaveSlotInfo {
  id: string;
  savedAt: number; // ms since the epoch
  label?: string; // chapter, place
  summary?: string; // last line of dialogue, party level
  thumbnail?: string; // data URL, see captureThumbnail()
  playTime?: number; // seconds
}
```

`fileSlots(game, { collect, apply, describe?, folder? })` is a ready implementation over `game.platform.files` (IndexedDB on the web, the data folder on desktop and mobile) that stores plain JSON: `collect()` returns what to save, `apply(data, info)` restores it, `describe(data)` adds the label and summary. It is meant for prototypes and templates; for encrypted, integrity-checked saves give the screens an adapter over `game.save`.

```ts
const slots = fileSlots(game, {
  collect: () => ({ dialogue: story.dialogue.state(), background: story.background }),
  describe: () => ({ label: 'Chapter 1', summary: story.summary() }),
  apply: (data) => game.goto('story', { restore: data }, { transition: 'fade' }),
});
```

`captureThumbnail(game, width = 320)` returns a JPEG data URL of the game canvas (not the DOM UI) for `thumbnail`.

## Limits

- Slot ids are letters, digits, `-` and `_`, up to 40 characters.
- `fileSlots` writes readable JSON without encryption or integrity check.
- The full-screen toggle needs a user gesture (browsers refuse it otherwise) and has no effect inside some WebViews.
- Rebinding replaces the first binding of an action with the captured one and keeps the others; there is no per-device rebinding list.
