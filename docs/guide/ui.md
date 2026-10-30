# UI layer

Menus, HUDs and dialogs are Vue 3 single-file components drawn in an HTML layer over the canvas. `@blacklight/ui` provides the screen stack, gamepad and keyboard focus, input prompts, themes, shapes, timelines and widgets. Game code keeps reading actions; while a menu is open, the game reads them as idle and the menu receives them.

```ts
// scenes/field/field.scene.ts
import { Scene } from '@blacklight/core';

export default class Field extends Scene {
  override create() {
    this.ui.open('Hud');
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push('PauseMenu');
  }
}
```

```vue
<!-- ui/PauseMenu.vue -->
<script setup lang="ts">
import { MenuList, useScreen, useUi } from '@blacklight/ui';

const screen = useScreen({ enter: 'slash' });
const ui = useUi();
const items = [
  { label: 'RESUME', value: 'resume' },
  { label: 'ITEMS', value: 'items' },
];

function select(value: string) {
  if (value === 'resume') screen.close();
  if (value === 'items') ui.push('Items');
}
</script>

<template>
  <div class="pause">
    <MenuList :items="items" @select="select" />
  </div>
</template>
```

The menu above works with a gamepad, a keyboard, a mouse and touch without further code: directions move the focus between rows, `confirm` clicks the focused row, `back` closes the screen. `templates/persona-menu` is a complete example: title screen, HUD, pause menu, items, party, a radial tactics menu and settings with rebinding.

<LiveExample src="concepts/screens" hint="The HUD is opened by the scene; Escape pushes the menu (Enter picks, Escape goes back)." />

::: tip Tutorial
The [UI tutorial](../tutorials/ui) has exercises to do in the page: push a menu, add a slider, show a gauge in the HUD.
:::

## Install

```sh
pnpm add @blacklight/ui vue
```

When `package.json` lists `@blacklight/ui` (in `dependencies` or `devDependencies`), the entry file the CLI generates installs the UI layer: it calls the `ui()` plugin with every `.vue` file under `ui/` and `scenes/*/ui/`, imports `@blacklight/ui/style.css`, adds the Vue plugin to Vite, keeps a single copy of `vue`, `pixi.js`, `motion`, `@blacklight/core` and `@blacklight/ui`, and excludes `@blacklight/ui` from dependency pre-bundling (its button glyphs are referenced with `new URL(..., import.meta.url)`, which pre-bundling breaks). The entry is written when `blacklight dev` or `blacklight build` starts, so restart the dev server after adding the package.

Type-check `.vue` files with `vue-tsc`; the `persona-menu` template's `typecheck` script runs `blacklight types && vue-tsc --noEmit`.

Without the CLI, install the plugin yourself:

```ts
import { createGame } from '@blacklight/core';
import { ui } from '@blacklight/ui';
import '@blacklight/ui/style.css';

const game = await createGame(config, {
  scenes,
  mount: document.getElementById('game')!,
  plugins: [ui({ screens: import.meta.glob(['./ui/**/*.vue', './scenes/*/ui/**/*.vue']) })],
});
```

| Option    | Default                                                                 | Meaning                                                                                    |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `screens` | none                                                                    | Lazy screen loaders by file path, from `import.meta.glob`. Gives the names.                |
| `theme`   | the saved setting, else `ui.theme` from the config, else `'blacklight'` | Theme name. The saved setting wins over this option.                                       |
| `themes`  | none                                                                    | Themes to register before the layer starts; see [custom themes](./ui-style#custom-themes). |

Calling `this.ui` in a scene without the package installed throws `No UI layer: add @blacklight/ui to the game`.

## Coordinates

The layer is a `div` added to the game's mount element, above the canvas. Inside it, the root element (`.bl-ui`) has the design size (`resolution.width` × `resolution.height`) and is translated and scaled exactly like the canvas, so a CSS pixel in a screen is a virtual pixel: in a 1920×1080 game, `left: 960px` is the horizontal center on a phone and on a 4K monitor, and `font-size: 48px` is 48 virtual pixels. Write sizes in `px`; `vw`, `vh` and `rem` refer to the browser window, not the design area.

A screen element (`.bl-screen`) covers the design area (`position: absolute; inset: 0`). In `extend` mode the canvas shows more than the design area on one axis; content placed outside the design area (negative coordinates, or a background with negative insets) is still visible up to the edge of the window. HUD elements that must stick to the real screen edges go in an [`Anchor`](./ui-style#anchors-and-safe-area), which follows the safe area.

Pointer events depend on the kind of screen. Screens opened with `open` let clicks through to the canvas, except on focusable elements (`[data-bl-focus]`) and elements with the `bl-interactive` class. Screens opened with `push` and `modal` catch every click, so the game under a menu receives none.

## Screens

A screen is a Vue component. Every `.vue` file under `ui/`, at any depth, is a named screen called by its file name without the extension: `ui/menus/PauseMenu.vue` is `'PauseMenu'`. Files under `scenes/<scene>/ui/` are local to that scene: in the scene `battle`, `'Hud'` is `scenes/battle/ui/Hud.vue` when it exists, else `ui/Hud.vue`. Any stack can also name a scene-local screen by its full key, `'battle:Hud'`. Two files with the same key (`ui/a/Menu.vue` and `ui/b/Menu.vue`) log a warning naming both paths; the last one found is used.

A named screen is loaded the first time it opens, as its own chunk. `open`, `push` and `modal` return at once, but the screen joins the stack only once its code has loaded: it enters with its content, its `useScreen` options apply from the first opening, and it blocks game input from that moment. A screen closed before its code arrives never appears; its result resolves at the `close` call.

A component can also be passed directly, which skips the lookup and is typed:

```ts
import BattleHud from './ui/BattleHud.vue';

this.ui.open(BattleHud, { party: this.party });
```

An unknown name throws with the known keys: `Unknown screen "PauseMenue". Screens are .vue files in ui/ or scenes/<scene>/ui/ (scene screens as "scene:Name"); known: PauseMenu, Items, battle:Hud.`

The second argument holds the component's props. They are bound once when the screen opens; to show changing data, pass a `reactive` object (or a store) and mutate it.

## Opening and closing

Each scene has its own screen stack, `this.ui`. In a component, `useUi()` returns the stack the current screen belongs to: the stack of its scene, or the global stack for a global screen. A screen opened from a menu therefore belongs to the same scene as the menu.

```ts
// in a component
const ui = useUi();
const order = await ui.modal<string>('Tactics');
if (await ui.confirm({ message: 'Return to the title screen?', danger: true })) {
  void game.goto('title');
}
```

| Method                                                 | Returns                        | Meaning                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open(screen, props, options)`                         | `ScreenHandle`                 | Shows a screen over the others without hiding them: HUDs, notifications, a title screen. Does not block game input or close on `back`.            |
| `push(screen, props, options)`                         | `ScreenHandle`                 | Shows a screen and hides every screen drawn below it until it closes: menus and submenus. Blocks game input; `back` closes it.                    |
| `modal(screen, props, options)`                        | `Promise<result \| undefined>` | Shows a screen over a dimmed, non-interactive view of the screens below: dialogs. Blocks game input; `back` closes it with `undefined`.           |
| `pop(result?)`                                         | `void`                         | Closes the top `push` or `modal` screen of this stack. Screens opened with `open` (HUDs) are never popped.                                        |
| `replace(screen, props, options)`                      | `ScreenHandle`                 | `pop()`, then `push()`: swaps the top menu, leaves HUDs open.                                                                                     |
| `closeAll()`                                           | `void`                         | Closes every screen of this stack, HUDs included.                                                                                                 |
| `confirm({ title, message, confirm, cancel, danger })` | `Promise<boolean>`             | Opens the built-in [`ConfirmDialog`](./ui-widgets#confirmdialog) as a modal. `true` only when the confirm button is chosen; `back` gives `false`. |

A `ScreenHandle` has `id`, `close(result?)` and `result`, a promise that resolves with the value given to `close` (or `undefined`) as soon as the screen starts closing. The leave transition plays after that; the screen is removed when it ends.

In scenes, `this.ui` is typed by `@blacklight/core` as `SceneUi`: the same seven methods, where `open`, `push` and `replace` return a `UiScreenHandle` (`id`, `close`, `result`) and `modal` resolves with `unknown`. For a typed result, cast to `UiStack` from `@blacklight/ui`, whose methods take the result type:

```ts
import type { UiStack } from '@blacklight/ui';

const quit = await this.ui.confirm({ message: 'Quit?' }); // boolean
const order = await (this.ui as UiStack).modal<string>('Tactics'); // string | undefined
```

### Screen options

| Option        | Default                                     | Meaning                                                                                                            |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `enter`       | `'fade'`, `'zoom'` for `modal`              | Enter transition name. See [transitions](./ui-style#screen-transitions). `'none'` shows the screen at once.        |
| `leave`       | `'fade'`                                    | Leave transition name.                                                                                             |
| `blockInput`  | `true` for `push` and `modal`, else `false` | Game code reads every action as idle while the screen is open.                                                     |
| `closeOnBack` | `true` for `push` and `modal`, else `false` | The `back` action closes the screen when no `onBack` handler consumed it.                                          |
| `modal`       | `false`                                     | With `open`, `push` or `replace`, shows the screen as a modal (scrim, `zoom` enter, input blocked, `back` closes). |

A screen can set its own transitions with `useScreen({ enter, leave })`; they replace the caller's.

### Drawing order and covered screens

Screens are drawn scene screens first, then global screens, each group in opening order. A screen is:

- **hidden** (`visibility: hidden`, not interactive) when a `push` screen is drawn above it;
- **inert** (visible, not interactive) when a `modal` screen is drawn above it and no `push` is;
- **visible** otherwise.

A screen opened with `open` after a `push` is drawn above that push and stays visible. Global screens are drawn above every scene screen, so a scene's `push` never hides them, and a global `push` hides every scene screen. Toasts are drawn above all screens.

The modal dim layer is an element of class `bl-scrim` inside the modal screen, larger than the design area, colored with the theme's `scrim` color. Clicking it does nothing; a modal closes through its own buttons or `back`.

### Focus scope

Focus belongs to one screen at a time: the topmost screen that is a `push` or a `modal`, or an `open` screen with at least one focusable element. Directions, the pointer and `confirm` only reach elements of that screen. When it closes, focus returns to the screen below, on the element focused there last. See [Focus and input prompts](./ui-focus).

## Game input while a menu is open

While at least one open screen has `blockInput`, `game.input.blocked` is `true` and `pressed`, `held`, `released`, `value`, `axis` and `vector` return idle values for every player, in scenes, objects and behaviors. A player character stops moving under the pause menu without any check in its code. The pointer (`scene.pointer`, `game.input.pointer`, `game.input.touches`) is not blocked.

The UI reads input through `game.input.uiPlayer(n)`, the same actions for player `n` without the block. Components that read actions themselves use it too:

```ts
const game = useGame();
const screen = useScreen();

// Start closes the menu too. Escape is both `pause` and `back`: back already handled it.
onUiStep(
  () => {
    const input = game.input.uiPlayer(1);
    if (input.pressed('pause') && !input.pressed('back')) screen.close();
  },
  { onlyOnTop: true },
);
```

`onUiStep(callback, { onlyOnTop })` runs `callback` each time the UI layer reads input, after it handled directions, `confirm`, tabs and `back`: at every step, and at every displayed frame while the game is paused. With `onlyOnTop`, it skips the calls while a `push` or `modal` covers the component's screen. The listener is removed on unmount. `runtime.ticks` is the underlying event bus (`step` event), for code outside components.

Opening a screen does not pause the game: the scene keeps updating, only its input is idle. Call `this.game.pause()` when the world must stop, and `this.game.resume()` when the menu closes. While the game is paused, the UI layer reads input at every displayed frame, so menus keep working. `game.pause()` fades the `music`, `sfx` and `voice` buses to silence while the `ui` bus keeps playing, so menu sounds and timeline sounds are heard; see [Audio](./audio#unlocking).

Every joined player navigates the menus: a press by any of them counts.

## Back

The `back` action (Escape, Backspace and `Pad:B` by default) goes to the screen that holds the focused element, or else to the last `push` or `modal` screen. Its `onBack` handlers run, newest first; a handler that returns `true` consumes the press. When none does and the screen has `closeOnBack`, it closes with `undefined`. The theme's `back` sound plays in both cases.

```ts
const screen = useScreen({
  onBack: () => {
    if (editing.value) {
      editing.value = false;
      return true; // stay open
    }
  },
});
```

A screen opened during the current step does not receive that step's `back`: the press that opened a menu cannot also close it. With the default bindings Escape is both `pause` and `back`, so a screen that also closes itself on `pause` must ignore a `pause` press that comes with `back`, as in the example above; otherwise one Escape press closes a submenu and then its parent.

## useScreen

`useScreen(options)` is called in the setup of a component shown as a screen; it throws elsewhere.

| Option   | Meaning                                                                      |
| -------- | ---------------------------------------------------------------------------- |
| `enter`  | Enter transition, replacing the caller's.                                    |
| `leave`  | Leave transition, replacing the caller's.                                    |
| `onBack` | Called on `back`; return `true` to keep the screen open. Removed on unmount. |

| Returned         | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `close(result?)` | Closes the screen; `result` resolves the opener's promise.                     |
| `isTop`          | Computed `true` while no `push` or `modal` covers the screen.                  |
| `scene`          | The scene the screen belongs to, `null` for a global screen.                   |
| `entry`          | The internal screen entry: `id`, `mode`, `props`, `enter`, `leave`, `closing`. |

## Global screens and scene screens

A screen opened through a scene's `this.ui`, or through `useUi()` in one of its screens, belongs to that scene. When the scene stops (`goto`, `closeOverlay`), its screens are removed at once, without their leave transition, and their result promises resolve with `undefined`. An overlay scene has its own stack.

Global screens survive scene changes. Open them through the runtime:

```ts
import { uiOf } from '@blacklight/ui';

uiOf(this.game).global.open('Notifications'); // in a scene
useUiRuntime().global.push('Settings'); // in a component
```

The global stack has the same methods as a scene stack. It finds scene-local screens only by their full key (`'battle:Hud'`).

## Composables and runtime

| Composable                    | Returns                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `useGame()`                   | The running `Game`.                                                        |
| `useUi()`                     | The screen stack of the current screen's scene, or the global stack.       |
| `useUiRuntime()`              | The `UiRuntime`: theme, scale, focus, global screens.                      |
| `useScreen(options)`          | The current screen; see above.                                             |
| `useInputDevice(player)`      | Last device and pad family; see [input prompts](./ui-focus#input-prompts). |
| `useFocus(items, options)`    | A focus group over a list; see [useFocus](./ui-focus#usefocus).            |
| `useTimeline(clock)`          | A timeline stopped on unmount; see [timelines](./ui-style#timelines).      |
| `onUiStep(callback, options)` | Runs `callback` each time the UI reads input; see above.                   |

`useGame`, `useUiRuntime` and the composables built on them throw outside the UI layer. Outside Vue, `uiOf(game)` returns the runtime and throws when the package is not installed.

| `UiRuntime` member         | Meaning                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `global`                   | The global screen stack.                                                         |
| `forScene(scene)`          | The stack of a scene (what `scene.ui` returns).                                  |
| `theme`                    | Name of the active theme; assigning switches live and saves the choice.          |
| `scale`, `setScale(value)` | Player UI scale (a `ShallowRef`) and its setter, 0.75 to 1.5, saved.             |
| `safeArea`                 | Safe area in virtual pixels.                                                     |
| `frame`                    | Position and scale of the design area in CSS pixels of the mount.                |
| `focus`                    | The `FocusManager`: `current`, `focus(element)`, `move(direction)`, `confirm()`. |
| `entries`, `top`           | Open screens (opening order) and the screen that receives `back`.                |
| `back()`                   | Runs the `back` action as if pressed.                                            |
| `sound(kind)`              | Plays the theme sound `move`, `confirm`, `back` or `error`.                      |
| `ticks`                    | Event bus emitting `step` each time the UI has read input.                       |
| `element`                  | The layer's root element.                                                        |

## More

| Page                                | Covers                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------- |
| [Transitions](./ui-transitions)     | `iris`, `ink`, `shatter`, `slices`, `wipe`… between screens and scenes |
| [Rich text](./ui-rich-text)         | Color, size, shake, wave, icons, input glyphs, typewriter              |
| [Dialogue](./ui-dialogue)           | Ink stories, dialogue box, choices, backlog, auto and skip, saves      |
| [FX layer](./ui-fx)                 | Shaders on the game and on components (`<PixiRender>`)                 |
| [World-anchored UI](./ui-world)     | Name tags following objects, damage numbers                            |
| [Localization](./ui-localization)   | `locales/`, plurals, CJK, right to left, font subsetting               |
| [Accessibility](./ui-accessibility) | Text size, contrast, color filters, reduced motion, subtitles          |
| [Ready-made screens](./ui-screens)  | Settings, pause menu, save/load slots                                  |
| [Video](./ui-video)                 | Background videos, cutscenes, subtitles                                |

## Inspector

In dev builds (`blacklight dev`), F9 opens the UI inspector in the top-right corner of the game: the component under the pointer with its chain of parent components, props and state, an outline around it, the focused element and the screen it belongs to, and the screen stack (component, id, mode, owner scene). The CLI's generated entry installs it only in dev, from the `@blacklight/ui/inspector` entry, so release builds do not contain it. Without the CLI, call `installInspector(game, { key })` from that entry yourself; it returns `{ toggle, destroy }`. Component names and state come from Vue's development build, so the inspector shows nothing useful in a production build of Vue.

## Limits

- The UI is HTML over the canvas: shaders and Pixi filters cannot read or distort it (see [accepted limitations](./limitations#shaders-cannot-read-the-ui)).
- Two files with the same name under `ui/` register one name (with a warning); rename one to use both.
- A named screen opened for the first time appears only after its chunk has downloaded, which can take a moment on a slow connection.
- `this.ui` in scenes gives `unknown` results; cast to `UiStack` for typed results.
- Screens of a stopped scene disappear without a leave transition.
- Opening a menu does not pause the game.
