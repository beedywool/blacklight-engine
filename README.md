# Blacklight Engine

An open-source (MIT) TypeScript game framework for web developers. Games are scenes and object-oriented game objects written as plain classes with ES imports; rendering is PixiJS v8, light 3D comes from Three.js inside 2D scenes, and menus are Vue 3 components over the canvas, built for Persona-style UI. One project exports to web/PWA, Windows, macOS, Linux, Android, iOS and Steam and plays offline. `SPEC.md` is the full scope, `PROGRESS.md` lists each requirement with the test that covers it.

## What 1.0 contains

- **Runtime** (`@blacklight/core`): fixed-step loop, scenes loaded on demand with transitions and overlays, game objects (sprites, animated sprites from `.anim.json`, text, tilemaps with Tiled import, particles, video), 19 behaviors, collisions, input with actions over keyboard, pointer, touch and gamepads (SDL_GameControllerDB), audio, camera, tweens, encrypted saves with backups, typed asset and scene names, a debug overlay. 59.6 KB gzip without Pixi, Vue and Three.
- **UI** (`@blacklight/ui`): Vue 3 screens with spatial focus, Kenney input prompts that follow the last device, widgets, scene and screen transitions, rich text, Ink dialogue with backlog, an FX layer, localization with CJK line breaking and right-to-left layout, accessibility settings, video cutscenes with subtitles.
- **Light 3D** (`@blacklight/three`): glTF models (Draco, KTX2) between 2D layers and inside menus through render to texture. **Physics** (`@blacklight/physics`): Rapier 2D.
- **Online play** (`@blacklight/net`, `servers/relay`): rollback and lockstep sessions over a WebSocket relay, deterministic math and an ESLint rule that keeps simulation code deterministic, a network test harness.
- **Platforms**: web with PWA, Electron desktop apps (sandboxed renderer, IPC allowlist, fuses, V8 bytecode, installers for the three systems, signing and notarization from your credentials), Android and iOS through Capacitor, Steam (achievements, Cloud, rich presence, depots and upload), Discord presence. Updates go through stores only.
- **Modules and services**: http, sqlite, cloud-save, accounts-oidc (any OIDC provider), achievements (Steam, Game Center, Play Games or the reference server), telemetry with consent; a module registry; a reference server for accounts, saves, achievements and scores (`servers/reference`, Docker).
- **Tooling**: the `blacklight` CLI (create, dev with hot reload that keeps state, build every target, run, doctor, add, upgrade, sign, upload) and a VS Code extension (sprite sheet slicer, animation, layout, timeline and configuration editors, UI preview, live objects, asset browser, browser debugging).
- **Docs**: a VitePress site with guides, tutorials, a page and a live example per behavior, widget and transition, a playground, the API reference, and publishing guides per store.

## Templates

| Template       | What it is                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `empty`        | The smallest project: one scene, one screen, a name on black. The default.                                                              |
| `2d-with-3d`   | glTF models between two 2D layers, a portrait rendered to a texture, a menu showing a turning model, and a benchmark scene.             |
| `platformer`   | One side-scrolling level made in Tiled: a hero that runs and jumps, coins, slimes, a checkpoint, a goal, and touch controls for phones. |
| `persona-menu` | A title screen, a walkable field and a Persona-style pause menu with items, party and settings with rebinding.                          |
| `visual-novel` | An Ink story with portraits, choices and saves, a gallery and an intro cutscene, in English, Japanese and Arabic.                       |
| `party-game`   | Six mini-games for 1 to 8 local players, or online through a relay with rollback, with player profiles and optional accounts.           |

Each one runs as it is and builds for every target. `docs/guide/templates.md` describes them.

## Make a game

Requires Node.js 24+ and [pnpm](https://pnpm.io/installation) 12+. The engine is installed from its [GitHub releases](https://github.com/beedywool/blacklight-engine/releases), not from npm: each release holds one `.tgz` per package and the VS Code extension's `.vsix`, and a game's `package.json` points at the tarballs of one release by URL. Third-party dependencies still come from npm.

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game
cd my-game
pnpm install
pnpm dev                 # http://localhost:5173, hot reload keeps the game's state
pnpm build               # web build in dist/
pnpm blacklight build --target linux    # or win, mac, steam, android, ios → release/<target>/
pnpm blacklight doctor   # what each target needs on this machine
pnpm blacklight upgrade  # move the game to the latest engine release
```

The VS Code extension is `blacklight-vscode-<version>.vsix` in the same release: `code --install-extension blacklight-vscode-<version>.vsix`, or **Install from VSIX...** in the Extensions view. Publishing the packages on npm and the extension on the Marketplace may come later.

A scene is a class in `scenes/<name>/<name>.scene.ts`; the first one is `entry` in `game.config.ts`. Each scene is loaded on demand as its own chunk. The configuration is checked at startup and every invalid field is shown on the page with the fix. `--template <name>` starts from one of the templates above (`pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template party-game`).

To work on the engine itself, create games from a checkout with `node packages/create/dist/index.js my-game --link <checkout>` (see `CONTRIBUTING.md`).

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
| `packages/create`        | `create-blacklight`: the project scaffolder, run with `pnpm dlx <release>/create-blacklight.tgz`                                                                             |
| `packages/vscode`        | Blacklight Engine VS Code extension (editors, completion, asset browser, live debugging)                                                                                     |
| `servers/`               | relay (online play) and reference server (cloud saves, achievements, accounts); `servers/docker-compose.yml` runs both                                                       |
| `templates/`             | the six templates: `empty`, `2d-with-3d`, `platformer`, `persona-menu`, `visual-novel`, `party-game`                                                                         |
| `docs/`                  | VitePress site in the BlackLight style                                                                                                                                       |
| `e2e/`                   | Playwright tests (phase gates) and `fixtures/`, small test games                                                                                                             |

```sh
pnpm install && pnpm build
pnpm test && pnpm lint && pnpm typecheck
pnpm e2e                 # first run: pnpm exec playwright install chromium
pnpm bench               # NF-01 to NF-03 benchmarks (docs/benchmarks.md)
```

## Documentation

The site in `docs/` (guides, tutorials with exercises, live examples, playground, API reference) runs locally. The API reference is generated from the packages' built declarations, so build them first:

```sh
pnpm install && pnpm build
pnpm docs:dev            # http://localhost:5173, reloads on edit
```

`pnpm docs:dev` and `pnpm docs:build` also generate the API reference into `docs/api/` and build the engine bundle the live examples run in (`docs/public/runner/`); both folders are git-ignored. To check the production site:

```sh
pnpm docs:build          # also runs pnpm api:check; fails on dead links
pnpm --filter blacklight-docs preview
```

Start with `docs/guide/getting-started.md` (a controllable animated character and a menu, tested end to end in CI). Publishing a game: `docs/guide/deploy-web.md`, `docs/guide/desktop.md`, `docs/guide/mobile.md`, and one step-by-step guide per provider in `docs/publishing/` (Apple, Windows code signing, Android keystore and Play App Signing, Steamworks, an OIDC issuer, GitHub repository secrets for the game's build workflow). Performance numbers are in `docs/benchmarks.md`, the accepted limitations in `docs/guide/limitations.md`.

`pnpm docs:screenshots` regenerates the pictures of the getting-started guide (it drives VS Code and a browser; Linux only). Deployment is in `docs/guide/deploy-docs.md`.

## CI

CI (`.github/workflows/ci.yml`) has two tiers. The fast tier runs on every push and pull request and must stay green: lint, type checks, unit tests with the coverage gate, `api:check` and the docs build on Linux, unit tests and the VS Code extension tests on Windows and macOS, the e2e suite (browsers and Electron) on Linux, and the desktop installers of the three systems. The full tier runs every night and on demand without blocking pushes: the e2e suite on macOS as well, the benchmarks on Linux and macOS against the spec's absolute limits, the Android emulator and the iOS Simulator. The Windows e2e suite and benchmarks run on a real Windows machine (CONTRIBUTING.md), since GitHub's Windows runners have no GPU, and the 10 % benchmark regression gate runs locally with `pnpm bench`. A run by hand can pick jobs and systems: `gh workflow run ci.yml --ref main -f jobs=bench -f os='["macos-latest"]'`. Releases come from `.github/workflows/release.yml` on a `v*` tag (CONTRIBUTING.md, "Versions and releases").

## How the work is organized

`SPEC.md` holds every requirement with an ID (`RT-07`, `UI-03`…); `CLAUDE.md` holds the working rules and the order of phases, each closed by an automated gate. `PROGRESS.md` lists each ID with the test that covers it, `DECISIONS.md` every choice the spec left open, `MANUAL_TESTS.md` what only a person with the hardware can check (real gamepads, phones, the Steam client, signing certificates).

## Current limits

- Hardware, accounts and the release itself are checked by hand before each release, with the steps and expected results in `MANUAL_TESTS.md`: real gamepads on each OS, rumble and light bar, real Android phones and iPhones, NF-01 to NF-03 on the reference phones (Galaxy A54, iPhone 12), the Steam client and overlay, Discord, signing and notarization with real credentials, Game Center and Play Games, online matches between machines, Rosetta on Apple silicon, the GitHub release and a game created from it on a clean machine.
- NF-01 (60 fps), NF-02 (start time) and NF-03 (memory) are measured on this repository's desktop, on an Android emulator and on CI runners (`docs/benchmarks.md`); the reference phones have not been measured yet. CI runners have no real GPU, so CI checks the absolute limits and records its numbers, and the 10 % regression gate runs locally with `pnpm bench` (deviation from SPEC §11.1, `DECISIONS.md`).
- On Windows, CI runs the unit tests, the VS Code extension tests and the installer build; the e2e suite and the benchmarks run on a real Windows machine (CONTRIBUTING.md, MANUAL_TESTS.md).
- CI runs GitHub's current runner images (`ubuntu-latest`, `macos-latest`, `windows-latest`, an API 35 Android emulator, the iOS Simulator of `macos-26`); the oldest supported versions of NF-05 (Windows 10, macOS 12, Ubuntu 22.04, Android 8, iOS 15) and the previous version of each browser are checked by hand.
- No controller gyroscope or accelerometer (the SDL binding exposes no sensors), no Steam leaderboards (steamworks.js does not expose them; scores go to the reference server).
- Everything installs from GitHub releases: the packages are not on npm and the extension is not on the VS Code Marketplace or Open VSX (`DECISIONS.md`). The module registry is served by GitHub Pages (`https://beedywool.github.io/blacklight-engine/registry`) from the first release on. The documentation site is built locally (`pnpm docs:dev`) or deployed by you (`docs/guide/deploy-docs.md`); it is not hosted by the project.
- Accounts have no default provider: each game sets its own OIDC `issuer` (`docs/publishing/oidc.md`).
- The accepted limitations of 1.0 (shaders cannot read the HTML UI, float differences between V8 and JavaScriptCore, the Steam overlay in Electron, client-side protection, bytecode per Electron version, controller sensors, Steam leaderboards) are in `docs/guide/limitations.md`.
