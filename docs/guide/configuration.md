# Configuration

`game.config.ts` default-exports `defineConfig({...})`. `defineConfig` returns its argument unchanged; its role is to give the file types and completion.

```ts
import { defineConfig } from '@blacklight/core';

export default defineConfig({
  name: 'My Game',
  id: 'com.example.mygame',
  version: '0.1.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080, mode: 'extend' },
});
```

| Field                 | Default        | Meaning                                                                                                                              |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`                | required       | Display name: window title, store listings.                                                                                          |
| `id`                  | required       | Lowercase reverse-domain identifier (`com.studio.game`). App ids and save folders derive from it, so do not change it after release. |
| `version`             | required       | Semver version of the game.                                                                                                          |
| `entry`               | required       | First scene, by folder name.                                                                                                         |
| `resolution.width`    | required       | Design width in virtual pixels.                                                                                                      |
| `resolution.height`   | required       | Design height in virtual pixels.                                                                                                     |
| `resolution.mode`     | `'extend'`     | `extend` scales the design area to fit and shows more of the scene on the long side; `letterbox` keeps black bars.                   |
| `resolution.pixelArt` | `false`        | Nearest-neighbour filtering, integer scaling (when the screen is at least the design size) and integer positions.                    |
| `tickRate`            | `60`           | Logic steps per second; `update()` runs at this rate whatever the display rate.                                                      |
| `pauseOnBlur`         | `true`         | Stops the logic while the window is hidden or unfocused.                                                                             |
| `input.actions`       | defaults       | Input actions and their bindings, merged over the default actions. See [Input](./input).                                             |
| `input.deadzone`      | `0.2`          | Stick dead zone, 0 to 1.                                                                                                             |
| `ui.theme`            | `'blacklight'` | UI theme at the first start; the player's saved choice wins. See [UI themes](./ui-style#themes).                                     |
| `ui.scale`            | `1`            | UI scale at the first start; the player's saved choice wins.                                                                         |
| `seed`                | new each run   | Seed (string or number) of `game.random` and of every scene's generator. Fix it for replays and tests.                               |

Every coordinate in a game is in virtual pixels: `(0, 0)` is the top-left corner of the design area, `(width, height)` its bottom-right, whatever the screen. In `extend` mode the visible area is larger than the design area on one axis; keep backgrounds wider or taller than the design size so the edges are covered.

An invalid configuration stops the game before the first scene and lists every problem with its fix, for example ``id must be a lowercase reverse-domain identifier, e.g. `id: "com.example.mygame"` ``.

Saves, security, targets, modules, locales, accounts and platform settings join this file as their packages land.
