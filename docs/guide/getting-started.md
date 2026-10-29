# Getting started

Requires Node.js 24 or newer and [pnpm](https://pnpm.io/installation) 12 or newer.

## Create a game

```sh
pnpm create blacklight my-game
cd my-game
pnpm install
pnpm dev
```

The dev server opens on `http://localhost:5173` and shows the title scene. Edit `scenes/title/title.scene.ts`, save, and the page reloads with the change. `pnpm dev --host` listens on the network so a phone on the same Wi-Fi can open the game.

`create` takes `--template <name>` to start from another template and `--force` to write into a folder that is not empty. The folder name becomes the package name.

## Build

```sh
pnpm build        # blacklight build --target web → dist/
pnpm preview      # serves dist/ on http://localhost:4173
```

The web build uses relative URLs, so `dist/` works from any path on a web server. Desktop, mobile and Steam targets are added by their packages; `blacklight build --target <name>` explains which targets your installed CLI supports.

## What you get

```
my-game/
├── game.config.ts               name, id, version, entry scene, resolution
├── scenes/title/title.scene.ts  the first scene
├── objects/  ui/  modules/  assets/  public/
├── package.json                 dev, build, preview, typecheck
└── tsconfig.json
```

`game.config.ts` is checked when the game starts: every invalid field is listed on the page with the fix, instead of a blank screen. The `.blacklight/` folder holds the entry files the CLI generates on each run; it is ignored by git and should not be edited.

## Next

- [Project layout](./project-layout): where scenes, objects and assets go, and the import aliases.
- [Scenes](./scenes): the scene lifecycle and switching scenes.
- [Configuration](./configuration): every `game.config.ts` field.
