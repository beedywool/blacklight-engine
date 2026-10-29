# Blacklight Engine

An open-source (MIT) TypeScript game framework for web developers. Games are scenes and object-oriented game objects written as plain classes with ES imports; rendering is PixiJS v8, light 3D comes from Three.js inside 2D scenes, and menus are Vue 3 components over the canvas, built for Persona-style UI. One project exports to web/PWA, Windows, macOS, Linux, Android, iOS and Steam and plays offline. The engine is in development towards 1.0: `SPEC.md` is the full scope, `PROGRESS.md` what works today.

## Make a game

Requires Node.js 24+ and [pnpm](https://pnpm.io/installation) 12+.

```sh
pnpm create blacklight my-game
cd my-game
pnpm install
pnpm dev                 # http://localhost:5173, hot reload keeps the game's state
pnpm build               # web build in dist/
pnpm blacklight build --target linux    # or win, mac, steam, android, ios → release/<target>/
pnpm blacklight doctor   # what each target needs on this machine
```

A scene is a class in `scenes/<name>/<name>.scene.ts`; the first one is `entry` in `game.config.ts`. Each scene is loaded on demand as its own chunk. The configuration is checked at startup and every invalid field is shown on the page with the fix. Templates: `empty`, `persona-menu`, `visual-novel`, `2d-with-3d` (`pnpm create blacklight my-game --template visual-novel`). The documentation in `docs/` (run `pnpm docs:dev` in this repository) has a guide per subsystem.

Until the packages are published on npm, create games from a checkout with `node packages/create/dist/index.js my-game --link <checkout>` (see `CONTRIBUTING.md`).

## Repository

| Folder                   | Content                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`          | `@blacklight/core`: loop, scenes, objects, behaviors, animations, collisions, input, audio, camera, tweens, saves, security, modules, platform interface, deterministic math |
| `packages/ui`            | `@blacklight/ui`: Vue 3 UI layer, focus, Kenney prompts, themes, widgets, transitions, rich text, Ink dialogue, FX layer, localization, accessibility, video                 |
| `packages/three`         | `@blacklight/three`: light 3D (Three.js in Pixi's WebGL context, render to texture, glTF)                                                                                    |
| `packages/physics`       | `@blacklight/physics`: Rapier 2D rigid bodies                                                                                                                                |
| `packages/net`           | `@blacklight/net`: rollback and lockstep sessions, relay client, network test harness                                                                                        |
| `packages/native`        | `@blacklight/native`: Electron app, IPC bridge, SDL gamepads, Steam, Discord, `defineNative`                                                                                 |
| `packages/mobile`        | `@blacklight/mobile`: Android and iOS (Capacitor): app files, Keystore/Keychain save key, haptics, achievements                                                              |
| `packages/modules/*`     | official modules: http, sqlite, cloud-save, accounts-oidc, achievements, telemetry                                                                                           |
| `packages/registry`      | module registry index format, validator, static API generator                                                                                                                |
| `packages/eslint-plugin` | `eslint-plugin-blacklight`: deterministic simulation code                                                                                                                    |
| `packages/cli`           | `@blacklight/cli`: the `blacklight` command (create, dev, build every target, run, doctor, lint, types, add/search/publish, sign, upload)                                    |
| `packages/create`        | `create-blacklight`: the scaffolder behind `pnpm create blacklight`                                                                                                          |
| `packages/vscode`        | Blacklight Engine VS Code extension (editors, completion, asset browser, live debugging)                                                                                     |
| `servers/`               | relay (online play) and reference server (cloud saves, achievements, accounts); `servers/docker-compose.yml` runs both                                                       |
| `templates/`             | `empty`, `persona-menu`, `visual-novel`, `2d-with-3d`; `party-game` and `platformer` come with phase 4                                                                       |
| `docs/`                  | VitePress site in the BlackLight style                                                                                                                                       |
| `e2e/`                   | Playwright tests (phase gates) and `fixtures/`, small test games                                                                                                             |

```sh
pnpm install && pnpm build
pnpm test && pnpm lint && pnpm typecheck
pnpm e2e                 # first run: pnpm exec playwright install chromium
```

CI (`.github/workflows/ci.yml`) runs lint, type checks, unit tests, the builds and the browser tests on Linux, Windows and macOS, Electron end-to-end tests on the three systems, the Android emulator and the iOS Simulator, and the VS Code extension tests. The repository has no remote yet, so CI has not run: every gate so far passed on Linux only.

## How the work is organized

`SPEC.md` holds every requirement with an ID (`RT-07`, `UI-03`…); `CLAUDE.md` holds the working rules and the order of phases, each closed by an automated gate. `PROGRESS.md` lists each ID with the test that covers it, `DECISIONS.md` every choice the spec left open, `MANUAL_TESTS.md` what only a person with the hardware can check (real gamepads, phones, the Steam client, signing certificates).

## Current limits

- Phases 0 to 3 are done (see `PROGRESS.md`); phase 4 (docs site with live examples and playground, `party-game` and `platformer` templates, PWA) and phase 5 (release) remain.
- Only Linux ran the gates. Windows, macOS and iOS builds are written and wired into CI but have never run; iOS needs a Mac.
- Hardware and accounts are checked by hand (`MANUAL_TESTS.md`): real gamepads, phones, the Steam client, Discord, Game Center / Play Games, signing certificates.
- Controller gyro is not available on desktop (the SDL binding exposes no sensors); Steam leaderboards are missing from steamworks.js.
- The npm packages are not published and the `@blacklight` npm scope is not yet claimed (`DECISIONS.md`). Default URLs for the module registry and the BlackLight SSO preset are placeholders to confirm.
- Unit test coverage of core is below the 80 % target of NF-07.
- The accepted limitations of 1.0 (shaders and HTML UI, float differences on iOS, Steam overlay in Electron, client-side protection) are in `docs/guide/limitations.md`.
