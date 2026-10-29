# Project layout

```
my-game/
├── game.config.ts
├── scenes/<name>/<name>.scene.ts   + objects/ ui/ assets/ local to the scene
├── objects/<name>/<name>.object.ts + sprite or sheet + <name>.anim.json
├── models/                         glTF / GLB
├── ui/                             global screens, components, themes
├── animations/                     shared timelines
├── stories/                        Ink files
├── modules/                        game-local modules
├── locales/<lang>.json
└── assets/                         fonts, audio, video, shared images
```

A scene's name is its folder name: `scenes/battle/battle.scene.ts` is the scene `battle`, and its default export is the scene class. A file named differently from its folder (`scenes/battle/fight.scene.ts`) stops the game with an error that says which name to use. Each scene is its own chunk: the code and assets of `battle` are only downloaded when the game first goes to it.

Things used by one scene stay in that scene's folder (`scenes/battle/objects/shadow`); things shared by several scenes go in the top-level folders.

## Import aliases

| Alias      | Folder     |
| ---------- | ---------- |
| `@objects` | `objects/` |
| `@ui`      | `ui/`      |
| `@modules` | `modules/` |
| `@assets`  | `assets/`  |
| `@models`  | `models/`  |
| `@stories` | `stories/` |

```ts
import Player from '@objects/player/player.object';
```

The aliases work in the dev server and in builds, and `tsconfig.json` declares them for the editor.

## Static files

Files in `public/` are copied as they are to the build root and served at `/`. Prefer `assets/` and imports for anything a scene uses: imported files get hashed names (safe to cache forever) and are preloaded with their scene.
