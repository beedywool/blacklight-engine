# VS Code extension

The Blacklight Engine extension adds editors, completion and live debugging to VS Code. It activates in a folder that contains a `game.config.ts` and finds the game from the open file, so a monorepo with several games works too. Everything it edits stays plain TypeScript or JSON: you can edit the same files by hand, review them in a diff and keep them in git.

Install the `.vsix` file attached to each [GitHub release](https://github.com/beedywool/blacklight-engine/releases) (`blacklight-vscode-<version>.vsix`) with `code --install-extension blacklight-vscode-1.2.0.vsix`, or with **Install from VSIX...** in the `...` menu of the Extensions view ([Install the tools](./installation#the-blacklight-engine-extension)). The extension is not on the Marketplace or Open VSX yet. To try a change of this repository, build and install the package yourself:

```sh
pnpm --filter blacklight-vscode build
pnpm --filter blacklight-vscode package   # writes packages/vscode/dist/blacklight.vsix
code --install-extension packages/vscode/dist/blacklight.vsix
```

| Feature                                             | Opens with                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [New scene, new object](#new-scene-and-new-object)  | **Blacklight: New Scene / New Object**, or right-click `scenes/` or a folder                    |
| [Snippets and completion](#snippets-and-completion) | Typing in `.ts` files                                                                           |
| [Sprite-sheet slicer](#sprite-sheet-slicer)         | Right-click a `.png` > **Slice Sprite Sheet**                                                   |
| [Animation editor](#animation-editor)               | **Open Animation Editor** in the title bar of an `.anim.json`                                   |
| [Scene editor](#scene-editor)                       | Opening a `.layout.json`, or **Open Scene Editor** on a scene                                   |
| [UI preview](#ui-component-preview)                 | **Preview UI Component** in the title bar of a `.vue` file                                      |
| [UI timeline editor](#ui-timeline-editor)           | Opening a `.timeline.json`, or **New UI Timeline**                                              |
| [Configuration form](#configuration-form)           | **Edit Game Configuration** in the title bar of `game.config.ts`                                |
| [Asset browser](#asset-browser)                     | **Blacklight: Open Asset Browser**                                                              |
| [Debugging](#debugging)                             | **Blacklight: Debug Game in Browser**, the **Live Objects** view in the Blacklight activity bar |

The editors use the BlackLight look: black surfaces, grey containers, white focus outlines.

## New scene and new object

**New Scene** asks for a name and writes `scenes/<name>/<name>.scene.ts` (a `Scene` subclass with `create()` and `update()`) and an empty `assets/` folder. **New Object** asks for a name and a kind and writes `objects/<name>/<name>.object.ts`:

| Kind            | Files                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------- |
| Animated sprite | `<name>.object.ts` (a `Sprite` with `static animations`) and `<name>.anim.json` (`idle`, `run`) |
| Sprite          | `<name>.object.ts`; the sprite shows `<name>.png` from the folder                               |
| Shape           | `<name>.object.ts`: a `Graphics` drawing a 16 px square with a box hitbox                       |

Run from the explorer on a scene folder, New Object writes a scene-local object (`scenes/<scene>/objects/<name>/`). Names are turned into folder names (`Big Enemy` → `big-enemy`, class `BigEnemy`); a name that exists is refused.

## Snippets and completion

| Prefix                                                      | Inserts                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| `bl-scene`                                                  | A scene class named after the file                      |
| `bl-object`                                                 | An animated sprite object with a behavior               |
| `bl-spawn`                                                  | `this.spawn('Name', { x, y })`                          |
| `bl-pressed`                                                | `if (this.input.pressed('confirm')) { }`                |
| `bl-collide`                                                | An `onCollide(other)` handler                           |
| `bl-after`, `bl-tween`, `bl-goto`, `bl-screen`, `bl-layout` | Timer, tween, scene change, screen, `this.load(layout)` |

Completion fills in names the engine reads as strings, from the project files:

| Where                                              | Suggests                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `static ` in a scene or object class body          | The static properties the engine reads (`assets`, `layers`, `size` / `animations`, `behaviors`, `hitbox`, `collision`, `tags`, `serialize`, `texture`), as snippets |
| `this.play('…')`                                   | Animation names of the object's `.anim.json` (of every object outside object folders)                                                                               |
| `input.pressed('…')`, `held`, `released`, `rebind` | Input actions: `.blacklight/types.d.ts` when the CLI wrote it, else the defaults and `input.actions` of `game.config.ts`                                            |
| `static assets = ['…']`                            | Asset paths as the runtime resolves them: `./…` in the file's folder, `@assets/…`, `@objects/…`, `/…`                                                               |
| `audio.play('…')`, `audio.music('…')`              | Sound keys (file names without extension)                                                                                                                           |
| `goto('…')`, `overlay`, `hostScene`, `preload`     | Scene names                                                                                                                                                         |
| `spawn('…')`, `find`, `findAll`, `is`              | Object names                                                                                                                                                        |
| `ui.push('…')`, `open`, `modal`, `replace`         | Screen names (`.vue` files of `ui/` and `scenes/*/ui/`)                                                                                                             |

TypeScript keeps checking the same names through the generated `Register` types; completion only saves typing.

## JSON Schemas

`.anim.json`, `.layout.json` and `.timeline.json` files are validated against the engine's schemas (`@blacklight/core/schema/*.schema.json`), so VS Code underlines a negative `fps`, a misspelled key or a missing `type`, and completes keys with their documentation. Files that set `$schema` use that path instead.

## Sprite-sheet slicer

Opens a PNG with a frame grid over it. Set the frame width, height and spacing (margin and gap between frames); the grid is guessed from the name (`hero@32x32.png`) or from the image shape (a horizontal strip of square frames). Frames are numbered in the order the runtime reads them: left to right, top to bottom.

Add animations by name, click frames to add them to the selected animation (Shift-click adds a range) and watch the preview at the chosen FPS. **Save**:

- renames the image after its grid (`slime.png` → `slime@16x16.png`; `+2` is added for spacing), which is how the runtime knows the frame size;
- writes `<folder>.anim.json` with `source`, `fps`, `default` (the first animation) and one entry per animation; consecutive frames are written as a range (`{ "from": 0, "to": 3 }`). An existing file is replaced after a confirmation.

## Animation editor

A form next to a live preview of an `.anim.json`: the file's `source`, default FPS and default animation; each animation's name, frames (`0-3`, `0, 2, 4`, or an Aseprite tag), FPS, loop, ping-pong, reverse, the animation that follows, and frame events (`1:step, 3:step|dust`). The preview plays the selected animation with the same frame resolution as the runtime (grid names, Aseprite frame durations and tags, ranges, ping-pong), shows events as they fire and lists the frames; click a frame to stop on it.

Each change rewrites the JSON (formatted, short values on one line) as one undo step. Edits made in the text editor update the preview as you type. **Show JSON** opens the text beside it.

## Scene editor

Places objects in a scene visually. The placement is saved in `scenes/<name>/<name>.layout.json`:

```json
{
  "$schema": "../../node_modules/@blacklight/core/schema/layout.schema.json",
  "objects": [
    { "type": "Hero", "x": 60, "y": 100 },
    { "type": "Coin", "x": 140, "y": 100, "tags": ["first"] },
    {
      "type": "Door",
      "x": 300,
      "y": 80,
      "layer": "back",
      "angle": 90,
      "scale": 2,
      "props": { "locked": true }
    }
  ]
}
```

| Field    | Required | Effect                                                         |
| -------- | -------- | -------------------------------------------------------------- |
| `type`   | yes      | Object name (the PascalCase folder name).                      |
| `x`, `y` | yes      | Position in virtual pixels.                                    |
| `layer`  | no       | Scene layer; the default layer when omitted.                   |
| `angle`  | no       | Rotation in degrees.                                           |
| `scale`  | no       | Uniform scale or `{ "x", "y" }`.                               |
| `tags`   | no       | Tags added to the object; `this.find('first')` finds it.       |
| `props`  | no       | Other public fields, set before `create()` like `spawn` props. |

The scene spawns them in order with `scene.load(layout)`:

```ts
import { Scene } from '@blacklight/core';
import layout from './level.layout.json';

export default class Level extends Scene {
  override create() {
    this.load(layout);
    this.player = this.find('Player')!;
  }
}
```

**Open Scene Editor** on a scene without a layout creates the file and adds the import and the `this.load(layout)` line to its `create()`.

The editor shows the scene's objects (its own and the global ones) with their thumbnail (first frame of the default animation), the world (`static size`, else the design resolution, with the design area outlined) and an inspector. Pick an object in the palette and click to place it (Shift keeps placing); drag to move (snapped to the grid size, 8 px by default); arrows nudge by 1 px (10 with Shift); Delete removes. The inspector edits position, layer (from `static layers`), angle, scale, tags and fields; Duplicate, Forward and Back change the list order, which is the spawn and draw order within a layer.

## UI component preview

Shows a screen in the running game with its focus states. The preview needs the dev server (`blacklight dev`): it loads the game in a frame, opens the `.vue` file's screen over the entry scene through the [debug channel](#debug-channel), and lists the screen's focusable elements. Click one to move the focus there, or **Cycle states** to focus each in turn every 1.2 s, to check every focused style, glyph and tooltip. Saving the `.vue` file updates the frame through Vue hot reload, keeping the screen open.

The preview runs the real game, theme and data. A screen that needs props or a scene state shows what it shows when pushed by name with no props.

## UI timeline editor

Edits timelines saved as data, `*.timeline.json`, with the semantics of [`useTimeline()`](./ui-style):

```json
{
  "$schema": "../node_modules/@blacklight/core/schema/timeline.schema.json",
  "steps": [
    { "to": ".title", "keyframes": { "x": ["-120%", "0%"] }, "duration": 0.35, "ease": "backOut" },
    { "sound": "ui-slash", "at": "<" },
    { "label": "items" },
    {
      "to": ".menu-item",
      "keyframes": { "opacity": [0, 1], "x": [40, 0] },
      "at": "items",
      "duration": 0.2
    }
  ]
}
```

| Step             | Fields                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| Animation (`to`) | `to` (CSS selector), `keyframes` (Motion keyframes), `at`, `duration` (0.3), `ease` |
| Label            | `label`, `at`                                                                       |
| Sound            | `sound` (asset key, played on the `ui` bus), `at`                                   |

`at` is a time in seconds, `"+0.1"` / `"-0.1"` after or before the end of the previous step, `"<"` with the previous step, a label, or `"label+0.2"`; without it a step starts when the previous one ends. Play a file in a screen with `applyTimeline`:

```ts
import { applyTimeline, useTimeline } from '@blacklight/ui';
import intro from '@ui/pause-intro.timeline.json';

const root = ref<HTMLElement>();
const timeline = useTimeline();
onMounted(() => applyTimeline(timeline, intro, { root: root.value }).play());
```

With `root`, selectors match inside the screen's element; without it, in the whole page when the timeline plays.

The editor draws each step as a bar on a time ruler. Drag a bar to move it (this writes a number in `at`), drag its right edge to change the duration, and edit the fields below. **Play in game** plays the timeline over the screens open in the running game: open the screen first (in the game or in the UI preview).

## Configuration form

A form over `game.config.ts`: name, identifier, version, first scene (a list of the scenes), resolution, fit mode, pixel art, steps per second, pause when hidden, random seed, UI theme and scale, and the input actions with their bindings. Each change edits only that value in the TypeScript source, found through its syntax tree: comments, order and the rest of the file stay as written, and new fields are added at the end of their object. The file is saved at once, so the dev server restarts the game with it. A value written as code (`seed: Date.now()`) is shown as computed and is edited in the file.

## Asset browser

Lists every asset of the game (the same files the runtime manifest holds) with a thumbnail for images and its size.

- **Unused** marks a file that no code or data file of the game references by its path, its file name or its key (`'coin'`). Object sheets named after their folder (`hero.png`, `hero@16x16.png`) and fonts in `assets/` count as used, because the engine loads them by convention. Filter with **Unused only** to find files to delete.
- **Weight per scene** sums what each scene downloads before it starts, the same set the runtime preloads: its `assets/` folder, its `static assets`, and the files of every object it can spawn (global objects and its own). Each file is listed with the reason it is loaded.

Click a file to open it. The list follows file changes.

## Debugging

### Breakpoints

**Debug Game in Browser** (or a `launch.json` configuration of type `blacklight`) opens the game of the running dev server in Chrome (or Edge) under VS Code's JavaScript debugger. Breakpoints set in `.ts` and `.vue` files of the game stop there, with the source maps Vite serves.

```json
{
  "type": "blacklight",
  "request": "launch",
  "name": "Debug game",
  "root": "${workspaceFolder}",
  "browser": "chrome"
}
```

| Field     | Default                           | Effect                |
| --------- | --------------------------------- | --------------------- |
| `root`    | the workspace folder              | Game folder.          |
| `url`     | the URL of the running dev server | Page to open.         |
| `browser` | `chrome`                          | `chrome` or `msedge`. |

Start `blacklight dev` first: the configuration reads its URL from `.blacklight/dev-server.json`.

### Live objects and variables

The **Live Objects** view (Blacklight activity bar) lists the scenes of the game open in the browser, their objects with position and tags, and, under each object, its variables: data fields, position and velocity, behavior fields, animation state. The list refreshes every second while the view is visible. Click a variable to change it (type a JSON value: `12`, `true`, `"text"`); the game applies it at once. The view's buttons resume, pause and step the game (one fixed step), and an object's button opens its source file.

### Debug channel

The live features talk to the game over the dev server's own WebSocket. In dev, the generated entry calls `installDebugChannel(game, import.meta.hot)` from `@blacklight/core/debug`; the CLI relays the custom `blacklight:debug` event between every connected client and writes `.blacklight/dev-server.json` (`url`, `port`, `token`, `pid`) so tools can find it. A tool connects like a browser tab (`ws://localhost:<port>/?token=<token>`, protocol `vite-hmr`) and sends requests:

```json
{
  "type": "custom",
  "event": "blacklight:debug",
  "data": { "kind": "request", "id": "1", "method": "objects" }
}
```

| Method                    | Params                         | Result                                                    |
| ------------------------- | ------------------------------ | --------------------------------------------------------- |
| `hello`                   | —                              | Client id, URL, game name, scene                          |
| `objects`                 | —                              | Scene, pause state, step, and every live object           |
| `inspect`                 | `id`, `scene`                  | The object's snapshot (fields, behaviors, animation)      |
| `set`                     | `id`, `scene`, `path`, `value` | Sets `hp`, `core.x`, `behaviors.0.speed`…; new snapshot   |
| `pause`, `resume`, `step` | `count` for `step`             | New state                                                 |
| `goto`                    | `scene`                        | Starts a scene                                            |
| `ui.open`                 | `screen`, `props`              | Pushes a named screen                                     |
| `ui.focusables`           | —                              | Focusable elements of the top screen and which is focused |
| `ui.focus`                | `index`                        | Focuses one                                               |
| `ui.timeline`             | `timeline`                     | Plays a timeline file's content                           |

Games answer with `{ "kind": "response", "id", "client", "result" | "error" }` and announce themselves with `{ "kind": "event", "type": "hello" }` when they start. A request with `target` is answered only by the game whose client id matches (the page's `?blacklight-client=` parameter). `installDebugChannel` returns its method table, so engine packages can add methods (`channel.methods.name = (params) => result`); the generated entry adds `ui.timeline` this way.

## Limits

- The live features (UI preview, Live Objects, Play in game, Debug Game) need `blacklight dev`; they do not attach to release builds, desktop or mobile builds.
- Breakpoints need Chrome or Edge installed; Firefox is not supported by VS Code's JavaScript debugger.
- The scene editor draws objects from their sprite image or first animation frame; shapes drawn in code (`Graphics`) and text show as grey boxes, and tilemaps are not drawn.
- The animation preview reads PNG sizes from the file header; JPEG and WebP sheets are listed but not previewed.
- Completion and the asset browser read files with patterns, not a type checker: names built at runtime are not resolved, and a string that only looks like an asset key counts as a use.
- The configuration form edits literal values only; fields computed in code stay read-only in the form. Fields other areas add to `GameConfig` appear in the form once listed in `CONFIG_FIELDS`.
- Variables are edited as JSON values; references to other objects and class instances are shown but cannot be set from the view.
