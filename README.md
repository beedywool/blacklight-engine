# Blacklight Engine

An open-source (MIT) TypeScript game framework for web developers. Games are scenes and object-oriented game objects written as plain classes with ES imports; rendering is PixiJS v8, light 3D comes from Three.js inside 2D scenes, and menus are Vue 3 components over the canvas, built for Persona-style UI. One project exports to web/PWA, Windows, macOS, Linux, Android, iOS and Steam and plays offline. The engine is in development towards 1.0: `SPEC.md` is the full scope, `PROGRESS.md` what works today.

## Make a game

Requires Node.js 24+ and [pnpm](https://pnpm.io/installation) 12+.

```sh
pnpm create blacklight my-game
cd my-game
pnpm install
pnpm dev                 # http://localhost:5173
pnpm build               # web build in dist/
```

A scene is a class in `scenes/<name>/<name>.scene.ts`; the first one is `entry` in `game.config.ts`. Each scene is loaded on demand as its own chunk. The configuration is checked at startup and every invalid field is shown on the page with the fix. The documentation in `docs/` (run `pnpm docs:dev` in this repository) covers the project layout, configuration and scenes.

Until the packages are published on npm, create games from a checkout with `node packages/create/dist/index.js my-game --link <checkout>` (see `CONTRIBUTING.md`).

## Repository

| Folder             | Content                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `packages/core`    | `@blacklight/core`: loop, scenes, objects, behaviors, animations, collisions, input, audio, camera, tweens        |
| `packages/physics` | `@blacklight/physics`: Rapier 2D rigid bodies                                                                     |
| `packages/cli`     | `@blacklight/cli`: `blacklight create / dev / build / preview / types`, asset manifest, atlases                   |
| `packages/create`  | `create-blacklight`: the scaffolder behind `pnpm create blacklight`                                               |
| `templates/`       | `empty` today; `party-game`, `visual-novel`, `persona-menu`, `platformer` and `2d-with-3d` come with their phases |
| `docs/`            | VitePress site in the BlackLight style                                                                            |
| `e2e/`             | Playwright tests (phase gates) and `fixtures/runtime`, a small test game                                          |

```sh
pnpm install && pnpm build
pnpm test && pnpm lint && pnpm typecheck
pnpm e2e                 # first run: pnpm exec playwright install chromium
```

CI (`.github/workflows/ci.yml`) runs lint, type checks, unit tests, the builds and the browser tests on Linux, Windows and macOS.

## How the work is organized

`SPEC.md` holds every requirement with an ID (`RT-07`, `UI-03`…); `CLAUDE.md` holds the working rules and the order of phases, each closed by an automated gate. `PROGRESS.md` lists each ID with the test that covers it, `DECISIONS.md` every choice the spec left open, `MANUAL_TESTS.md` what only a person with the hardware can check (real gamepads, phones, the Steam client, signing certificates).

## Current limits

- Only the `web` build target exists; desktop (Electron), mobile (Capacitor) and Steam targets come with phases 3c and 3d.
- The runtime (phase 1) is in: scenes, objects, 19 behaviors, sprite sheets and atlases, collisions, Rapier physics, input for 8 local players, audio, camera, tweens, snapshots, debug overlay. The UI layer (Vue), 3D, desktop, mobile, networking and tooling come next.
- No hot module replacement yet: saving a file reloads the page.
- Gamepads in Electron go through SDL only from phase 3c; until then every target uses the browser Gamepad API.
- The npm packages are not published and the `@blacklight` npm scope is not yet claimed (`DECISIONS.md`).
- The accepted limitations of 1.0 (shaders and HTML UI, float differences on iOS, Steam overlay in Electron, client-side protection) are in `docs/guide/limitations.md`.
