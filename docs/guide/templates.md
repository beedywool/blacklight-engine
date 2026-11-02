# Start from a template

Six templates ship with the engine. Each one is a complete project that runs as it is: scenes, objects, screens, and placeholder art for the part of a game it demonstrates. Start from the one closest to what you are building, run it, and delete what you do not need.

| Template       | What it is                                                                                                                              | Read next                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `empty`        | The smallest project: one scene, one screen, a name on black. The default.                                                              | [Getting started](./getting-started)                             |
| `2d-with-3d`   | glTF models between two 2D layers, a portrait rendered to a texture, a menu showing a turning model, and a benchmark scene.             | [3D models](./3d), [Render to texture](./3d-render-to-texture)   |
| `platformer`   | One side-scrolling level made in Tiled: a hero that runs and jumps, coins, slimes, a checkpoint, a goal, and touch controls for phones. | [Collisions and physics](./collisions), [Behaviors](./behaviors) |
| `persona-menu` | A title screen, a walkable field and a Persona-style pause menu with items, party and settings with rebinding.                          | [UI layer](./ui), [Focus and input prompts](./ui-focus)          |
| `visual-novel` | An Ink story with portraits, choices and saves, a gallery and an intro cutscene, in English, Japanese and Arabic.                       | [Dialogue](./ui-dialogue), [Localization](./ui-localization)     |
| `party-game`   | Six mini-games for 1 to 8 local players, or online through a relay with rollback, with player profiles and optional accounts.           | [Networking](./networking), [Accounts](./accounts)               |

## Create the project

`--template` names the template; without it, the project starts from `empty`. Create it in a new or empty folder:

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template platformer
cd my-game
pnpm install
pnpm dev        # http://localhost:5173
```

`pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz --help` prints the same list of names, read from the folders the package ships, so it is never out of date. A name that is not in the list stops the command with the ones that are: `Unknown template "platforme". Available templates: 2d-with-3d, empty, party-game, persona-menu, platformer, visual-novel.`

To try engine changes that are not released yet, point the new project at a checkout of this repository instead of a release: `node ../blacklight-engine/packages/create/dist/index.js my-game --template platformer --link ../blacklight-engine` writes `link:` dependencies to that checkout's packages, and they update with your changes without a rebuild.

Every template is a normal project after creation, so everything below the first step of [Getting started](./getting-started) applies unchanged: `pnpm dev` reloads on save, `pnpm build` writes the web build to `dist/`, `pnpm typecheck` generates the typed names and checks them, and `blacklight build --target <win|mac|linux|android|ios|steam>` targets the other platforms ([Command line tools](./tooling)).

All six come with a `.github/workflows/build.yml` that builds web, desktop (Windows, macOS, Linux), Android and iOS on every push and uploads each as an artifact. Signing is optional: add the secrets the workflow names and the builds are signed, otherwise they are not.

## `empty`

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game
```

`scenes/title/title.scene.ts` draws a dot and the line "Edit scenes/title/title.scene.ts and save", and there is nothing else: one scene, no screens, no objects. `game.config.ts` holds the name, the id, the version, the entry scene and a 1920 × 1080 resolution. This is the template [Getting started](./getting-started) uses, which turns it into a title menu, a field where an animated hero runs, and a pause menu in eight steps.

Use it to learn the engine, or when you know what you are building and want nothing in the way.

## `2d-with-3d`

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template 2d-with-3d
```

`scenes/arena` has the layers `back`, `actors` and `front`; `static layers3d` gives `actors` a perspective camera, so the models sort with the 2D bushes in front and behind them. The heroes are `Model3D` objects under `scenes/arena/objects/`, one of them Draco-compressed, one with a KTX2 texture; the portrait in the corner is a model rendered to a texture with a sepia filter and a circular mask; `ui/PauseMenu.vue` shows a turning model with `<ModelView>` from `@blacklight/three/ui`. The title scene has no 3D code, so none of Three.js is downloaded until the arena starts.

`scenes/bench` is the frame-rate benchmark: two animated 10 000-triangle models between 2D layers. Open `/#bench` to run it, `/#bench-2d` for the same scene without models.

The models in `models/` were generated by code in the engine repository (CC0); replace them with your own `.glb` files.

## `platformer`

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template platformer
```

`scenes/level/assets/level-1.json` is a Tiled map (1.10 or later): the `ground` tile layer and an `objects` point layer whose types are the object to spawn (`Coin`, `Slime`, `Checkpoint`, `Goal`), with `Start` placing the hero. Tile properties block or kill: `solid`, `jumpThru`, `hazard`. Open the file in Tiled and save it in place; the dev server reloads the level.

`objects/hero` uses the `platformer` behavior with animations from `hero.anim.json`, `objects/slime` walks with `patrol` and takes its walk length from the Tiled object's `distance` property, and `objects/touch-controls` adds a virtual joystick and jump button the first time the screen is touched. The three inputs drive the same actions, so the same code runs on keyboard, gamepad and phone.

## `persona-menu`

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template persona-menu
```

`scenes/field` walks a character with `eightDirections`, opens `ui/Hud.vue`, and pushes `ui/PauseMenu.vue` on `pause`. The menu is items, party, a radial tactics menu and settings with key rebinding, all navigable with the D-pad, the keyboard, the mouse and touch without any input code: [Focus and input prompts](./ui-focus) explains what makes that work. Start here for a game whose interface carries it.

## `visual-novel`

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template visual-novel
```

The story is Ink under `stories/<lang>/`, one file per language with the same knots and choices; `scenes/story/story.scene.ts` reacts to its tags (`bg`, `transition`, `fx`, `unlock`), the rest (`portrait`, `voice`, `music`, `sfx`) is the engine's. `ui/state.ts` holds the save slots and the gallery unlocks. Switch the language in SETTINGS › LANGUAGE to see the Japanese and Arabic versions; the Arabic one is right to left and uses the same screens.

Save slots use `fileSlots`, which writes plain JSON; replace `slotsFor` in `ui/state.ts` with an adapter over `game.save` when the saves need to be encrypted and checked.

## `party-game`

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template party-game
pnpm test        # mini-game rules and online matches, headless
```

The flow is a set of scenes: `title` → `player-select` (up to 8 players, profile or guest, READY!) → `game-select` (mini-game cards with their player range and settings) → `match` (banners, scores, pause menu, the mini-game as a sub-scene) → `results` (podium and points). Each mini-game is one scene with its own objects and `rules.ts`; `party/minigame.ts` is what they share: the banner and "GO!" that holds the controls until it ends, the power card, the per-player skins and the online mode.

The mini-games are written for rollback from the start: state lives on objects, they count steps instead of reading the clock, and randomness comes from the scene's seeded generator. Online play needs a relay (`pnpm exec blacklight-relay` from `@blacklight/relay`, its Docker image, or the desktop app's LAN relay), then ONLINE › HOST A ROOM. Signing in with BlackLight SSO is optional ([Accounts](./accounts)); guests and local profiles play offline.

## A template in a folder that already has files

The scaffolder writes into a folder that does not exist or is empty; on anything else it stops with `… is not empty. Choose another folder or pass --force to write into it.` `--force` copies the template over the folder, replacing the files whose names match and leaving the rest, which is only what you want on a folder you can afford to lose.

To move a template into a project you already have, create it next to the project and copy the parts across:

```sh
cd ..
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz template-sample --template persona-menu
```

Copy what you need from `template-sample` into your project: the `scenes/`, `objects/`, `ui/` and `assets/` folders, the fields of `game.config.ts` the template sets (`ui.theme` here), and the dependencies its `package.json` adds. The four lines every template carries are the ones that make the folder a Blacklight project:

```json
{
  "scripts": {
    "dev": "blacklight dev",
    "build": "blacklight build --target web",
    "typecheck": "blacklight types && tsc --noEmit"
  },
  "dependencies": { "@blacklight/core": "^1.0.0" },
  "devDependencies": { "@blacklight/cli": "^1.0.0" }
}
```

A template that has Vue screens also needs `@blacklight/ui` and `vue`, and `vue-tsc` in place of `tsc` in `typecheck`; `2d-with-3d` adds `@blacklight/three` and `three`; `party-game` adds `@blacklight/net` and the `accounts-oidc` and `http` modules. Take the exact versions from the template's `package.json` in the engine repository (`templates/<name>`) instead of the two above.

Starting a second template in the same folder is the same copy: nothing in a project names its template, so a scene from `platformer` and one from `persona-menu` run side by side in the same game.

## Limits

- The templates are worked examples, not a framework: they are updated with the engine, but a project created from one is yours alone from that point on and does not receive the template's later changes.
- There is no command that switches the template of an existing project; see above for copying one in.
- `--template` takes a folder name, not a URL or a Git repository.
- All art, sound and text in the templates are placeholders made for them (CC0), except the fonts, which come from the system or from the theme's bundled files.
