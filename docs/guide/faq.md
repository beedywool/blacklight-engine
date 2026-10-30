# FAQ

## Do I need to know Vue?

Only for menus and HUDs. Scenes, objects and behaviors are plain TypeScript classes. The UI layer uses Vue 3 single-file components because menus are documents (text, layout, focus, accessibility) that the DOM handles better than a canvas; a screen is a `.vue` file with a template, and the [widgets](./ui-widgets) cover most needs. A game without `@blacklight/ui` has no Vue at all.

## Can I write JavaScript instead of TypeScript?

The CLI accepts `.js` scenes and objects, but the engine is designed around types: scene names, actions, animation names and asset paths are typed from your project, and that is where most mistakes are caught. The docs and templates use TypeScript only.

## Why a fixed 60 Hz update?

Game logic that runs once per displayed frame behaves differently on a 60 Hz laptop and a 144 Hz monitor: jumps go higher, timers drift, replays diverge. `update()` runs at a fixed rate (`tickRate`, 60 by default) and rendering interpolates between steps, so movement is smooth on any display and the same inputs give the same game. Online rollback depends on it.

## Where is the editor?

There is no standalone editor. The [VS Code extension](./vscode) provides the visual tools: sprite-sheet slicer, `.anim.json` editor with preview, scene placement editor, UI timeline editor, config form, asset browser and debugging of the running game. Everything it edits stays readable TypeScript or JSON in your project.

## Is there visual scripting or an event sheet?

No. Game logic is code. The [migration guide](./migration) maps event-sheet concepts to classes and behaviors.

## How do I make it run on a phone or as a desktop app?

The same project builds for every target: `blacklight build --target web|win|mac|linux|android|ios|steam`. Desktop builds use Electron, mobile builds Capacitor; neither needs code changes. See [Desktop and Steam](./desktop) and [Android and iOS](./mobile). Store accounts and signing certificates are yours to provide.

## Does the game need a network connection?

No. Every target embeds its files, and the web build installs as an offline PWA. Online features (accounts, cloud saves, achievements, multiplayer) queue their requests while offline and sync when the connection returns.

## Can players cheat by editing saves or the console?

Release builds encrypt and sign saves with a key that belongs to the install, block devtools shortcuts, obfuscate code and watch protected values ([Production hardening](./security)). This stops save editors, console tweaks and casual memory scanning. It is a deterrent, not a guarantee: anything that must be fair between players is validated by a server.

## Can I use npm packages?

Browser packages: yes, import them as in any Vite app. Packages that need Node (file system, native addons) only run in a module's [native part](./modules-native), on desktop and mobile; the build fails with a readable message when game code imports one.

## Why is my sprite blurry, or my pixel art soft?

Set `resolution.pixelArt: true` in `game.config.ts`: textures use nearest-neighbour filtering and positions round to whole pixels. Scale small sprites with `scale` on spawn rather than drawing them small.

## My object does not collide.

Check that it has a hitbox (`Sprite` and `Graphics` get one from their size by default, a bare `GameObject` has none), that the two objects' collision layers are in each other's masks, and that it moves with `move()`, `velocity` or a movement behavior: setting `x` and `y` directly ignores solids. The debug overlay (F3 in dev) draws every hitbox. See [Collisions](./collisions).

## The game does not react to the keyboard in the docs examples.

Click the preview first: keyboard input goes to the frame that has focus. Live examples run in their own frame so that each one starts clean.

## How do I report a bug or propose a module?

Open an issue on the repository with the engine version (`blacklight --version`), the target and the smallest project that shows the problem; a [playground](/playground) link works well. Modules are published on npm as `blacklight-module-*` and listed through the [registry](./modules-registry).

## Limits

The [accepted limitations](./limitations) page lists what the engine does not do and why.
