# Assets

Images, sounds, fonts, videos and data files are found by the CLI, listed in a manifest, and loaded by the engine before the scene that needs them starts. Game code refers to them by key (`'coin'`) or by path (`'@assets/sfx/coin.ogg'`), never by URL.

## Where files go

| Folder                                                  | Content                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `scenes/<name>/assets/`                                 | Files one scene uses. Loaded before that scene starts.                  |
| `objects/<name>/`                                       | An object's sprite sheet, `.anim.json` and its own files.               |
| `assets/`                                               | Files shared by several scenes: fonts, music, common sounds and images. |
| `models/`, `stories/`, `ui/`, `animations/`, `locales/` | Files of the matching systems.                                          |
| `public/`                                               | Copied as is to the build root; not in the manifest, not preloaded.     |

The CLI lists every file with one of these extensions under those folders: images (`png`, `jpg`, `jpeg`, `webp`, `avif`, `gif`, `svg`), audio (`ogg`, `m4a`, `mp3`, `wav`, `opus`, `aac`, `flac`), fonts (`woff2`, `woff`, `ttf`, `otf`, `fnt`), video (`mp4`, `webm`, `mov`), data (`json`, `txt`, `ink`, `csv`) and 3D (`glb`, `gltf`, `bin`, `ktx2`, `drc`). Files and folders starting with a dot are skipped. `.anim.json` and `.tilemap.json` files are imported as code modules instead. Adding or removing a file reloads the dev server.

## Keys, paths and aliases

A **key** is the file name up to its first dot: `assets/sfx/coin.ogg` is `coin`, `objects/hero/hero.aseprite.json` is `hero`.

```ts
this.audio.play('coin');
```

A key is looked up in the current scene's folder first, then in `assets/`, then everywhere. When two different files share a key in the same place (`assets/sfx/hit.ogg` and `assets/voice/hit.ogg`), the lookup throws and lists them; use a path. Formats of one file (`coin.ogg`, `coin.m4a`) are the same file and do not conflict.

A **path** contains a `/` or a `.`:

| Form                   | Resolves to                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `@assets/sfx/coin.ogg` | `assets/sfx/coin.ogg`. Aliases: `@assets`, `@objects`, `@models`, `@stories`, `@ui`, `@modules`. |
| `./arena.png`          | Relative to the scene's folder (in `static assets`) or the object's folder (in object fields).   |
| `/assets/sfx/coin.ogg` | From the project root.                                                                           |
| `@assets/sfx/coin`     | Without extension: every format of that file.                                                    |

A missing key or path throws with the closest names.

## Preloading

Before a scene starts, the engine loads:

1. every file under `scenes/<name>/assets/`;
2. the scene's `static assets`;
3. the sprite sheet and `static assets` of every object class the scene can spawn (global objects and the scene's own).

```ts
export default class Battle extends Scene {
  static override assets = ['./arena.png', '@assets/music/battle', '@assets/sfx/'];
}
```

`static assets` entries are relative to the scene folder. An entry ending with `/` loads every file in that folder and its subfolders. An entry without extension loads every format of that file. An entry that matches nothing stops the scene with an error naming the closest file.

Files directly under `assets/` are not loaded automatically, except fonts: every `.woff2`, `.woff`, `.ttf`, `.otf` and `.fnt` under `assets/` is loaded before the first scene, so text can use those families from the start. List other shared files in `static assets` of the scenes that use them. A file stays loaded once loaded: going back to a scene does not download its files again.

While a scene loads after the first one, a thin progress bar is drawn at the bottom of the screen, and `game.events` emits `loading` with `{ scene, progress }`. `game.preload(name)` loads a scene's code and files ahead of time, so a later `goto` starts at once:

```ts
override create() {
  void this.game.preload('battle');
}
```

Files can also be loaded by hand: `await this.game.assets.load(['assets/levels/level-4.json'])`.

## Reading loaded files

| Method                                                                | Returns                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `game.assets.find(keyOrPath, { baseDir?, preferDirs?, extensions? })` | Project paths matching a key or path (several for multiple formats). |
| `game.assets.texture(path)`                                           | The Pixi `Texture` of a loaded image.                                |
| `game.assets.getJson(path)`                                           | The parsed content of a loaded `.json` file.                         |
| `game.assets.getText(path)`                                           | The content of a loaded `.txt`, `.ink` or `.csv` file.               |
| `game.assets.url(path)`                                               | The URL of a file (`undefined` for images packed in an atlas).       |
| `game.assets.has(path)`, `isLoaded(path)`, `paths`                    | Manifest queries.                                                    |

These read the cache synchronously. Reading a file that is not loaded throws an error that says to list it in `static assets` or to call `game.assets.load` first.

```ts
const [path] = this.game.assets.find('waves', { extensions: ['json'] });
const waves = this.game.assets.getJson<Wave[]>(path!);
```

## Atlases in release builds

`blacklight build` packs every PNG of the project up to 1024 × 1024 pixels into atlas pages of up to 4096 × 4096, with 2 pixels of extruded padding around each image so filtering never bleeds a neighbour in. The dev server serves files one by one. Game code does not change: keys, paths and `texture()` work the same, and grid sheets and Aseprite frames are cut from the atlas region. Larger PNGs and other image formats stay separate files.

Other files get hashed names in `dist/assets/`, so a web server can cache them forever. URLs are relative, so the build runs from any path.

## Fonts

Web fonts in `assets/` are loaded at startup; their family name is the file name without extension (`assets/fonts/pixellita.woff2` is `'pixellita'`). Fonts in a scene's `assets/` load with that scene. Bitmap fonts (`.fnt`, AngelCode text or XML) follow the same rule and load with their page images: at startup under `assets/`, with the scene in a scene's `assets/` folder. They are used with `bitmap: true` on a `Text`; see [Objects](./objects#text).

## Generated types

The CLI writes `.blacklight/types.d.ts` on every `dev` and `build`, and again when a file is added or removed or an `.anim.json`, an `.aseprite.json` or `game.config.ts` changes. It fills the engine's `Register` interface with the project's names:

```ts
// .blacklight/types.d.ts (generated)
declare module '@blacklight/core' {
  interface Register {
    scenes: 'level' | 'title';
    objects: 'Coin' | 'Hero';
    actions: 'action' | 'back' | 'confirm' | 'down' | 'fire' | 'jump' | 'left' | 'pause' | 'right' | 'up';
    animations: 'idle' | 'run';
    assets: 'assets/sfx/coin.ogg' | 'coin' | /* ... */;
  }
}
```

With it, `goto('batle')`, `spawn('Hreo')` and `pressed('jupm')` are type errors, and the editor completes scene, object and action names. Animation names and asset keys are suggested but any string is accepted, since sprites and files can be chosen at runtime. To refresh the file without starting the dev server (in CI, before `tsc`):

```sh
pnpm blacklight types
```

The command also validates `game.config.ts` and fails with the list of problems. The `typecheck` script of a new game runs it before `tsc --noEmit`.

## Limits

- Atlas pages are shared by the whole game: the first image needed from a page downloads the whole page, including images of scenes not visited yet.
- Only PNG files are packed into atlases.
- Asset keys are global: two files with the same name in different folders need paths, unless one of them is in the current scene's folder.
- 3D files (`glb`, `gltf`, `ktx2`…) are listed in the manifest but loaded by the 3D package, not by the scene preloader.
