# Blacklight Engine 1.0

Blacklight Engine 1.0 is a TypeScript game framework for web developers: scenes and game objects as plain classes, PixiJS v8 rendering, light 3D from Three.js inside 2D scenes, Vue 3 menus over the canvas, and one project that builds for web/PWA, Windows, macOS, Linux, Android, iOS and Steam and plays offline. Everything installs from the GitHub release: one `.tgz` per package, `create-blacklight.tgz` and the VS Code extension's `.vsix`. Nothing is published on npm or the VS Code Marketplace.

```sh
pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game
```

This summary covers what 1.0 delivers, what is checked by hand rather than in CI, and every accepted limitation. `PROGRESS.md` in the repository lists each requirement of the spec with the test that covers it, `DECISIONS.md` every choice the spec left open.

## What is delivered

- **Runtime** (`@blacklight/core`, RT-01 to RT-20): fixed-step loop, scenes loaded on demand with transitions, overlays and hosted sub-scenes, a typed object registry, sprites, animated sprites from `.anim.json`, text and bitmap fonts, tilemaps with Tiled import, particles, video, 19 behaviors, collisions, Rapier 2D physics (`@blacklight/physics`), input actions over keyboard, pointer, touch and gamepads (SDL_GameControllerDB in the browser, SDL in the desktop apps), audio, tweens, events, seeded randomness and deterministic math, camera, resolution handling, snapshots, and a debug overlay. The core is 59.6 KB gzip without Pixi, Vue and Three.
- **Light 3D** (`@blacklight/three`, 3D-01 to 3D-07): glTF models (Draco, KTX2) in Pixi's WebGL context between 2D layers, render to texture with filters and masks, models in Vue screens.
- **UI** (`@blacklight/ui`, UI-01 to UI-19): Vue 3 screen stack, spatial focus, Kenney input prompts that follow the last device, layout, shapes, timelines, widgets, scene, screen and in-scene transitions, rich text, Ink dialogue with backlog, an FX layer, world-anchored UI, localization with CJK line breaking and right-to-left layout, accessibility settings, ready-made screens, a dev inspector and video cutscenes with subtitles.
- **Saves and hardening** (SV-01 to SV-07, SEC-01 to SEC-10): encrypted and signed saves with atomic writes and a backup, password export, cloud saves; in release builds devtools shortcuts and debugging switches are refused, Electron fuses and ASAR integrity are set, the main process ships as V8 bytecode, the game code is obfuscated, a strict CSP applies, and mobile WebViews are not inspectable.
- **Online play** (`@blacklight/net`, `servers/relay`, NET-01 to NET-05): rollback and lockstep sessions over a WebSocket relay (Node, Docker), an ESLint rule that keeps simulation code deterministic, and a test harness for latency and loss. Four simulated players at 150 ms and 2 % loss play 10 minutes without a desync, and V8 and JavaScriptCore compute the same checksums.
- **Platforms** (PF-01 to PF-09): web with PWA, Electron desktop apps with installers for the three systems, Android and iOS through Capacitor, Steam (achievements, Cloud, rich presence, depots and `blacklight upload`), signing and notarization from the developer's credentials, updates through stores only, and a GitHub Actions build workflow in every new game.
- **Modules and services** (MOD-01 to MOD-06, SVC-01 to SVC-05): `defineModule` with native parts, a module registry (served by GitHub Pages), the official modules http, sqlite, cloud-save, accounts-oidc (any OIDC provider; the game sets its issuer), achievements (Steam, Game Center, Play Games or the server) and telemetry with consent, Discord Rich Presence, and a reference server for accounts, saves, achievements and scores (`servers/reference`, Docker).
- **Tooling** (TL-01 to TL-03): the `blacklight` CLI (create, dev with hot reload that keeps state, build for every target, run, doctor, add, upgrade, sign, upload) and a VS Code extension with a sprite sheet slicer, animation, layout, timeline and configuration editors, UI preview, live objects, an asset browser and browser debugging.
- **Documentation and templates** (DOC-01 to DOC-08): a VitePress site with guides, tutorials with exercises, a page and a live editable example for every behavior, widget and transition, a playground, the generated API reference, deployment guides and one publishing guide per provider (Apple, Windows code signing, Android keystore, Steamworks, an OIDC issuer, GitHub secrets). Six templates build for every target: `empty`, `2d-with-3d`, `platformer`, `persona-menu`, `visual-novel` and `party-game`.

CI runs in two tiers. The fast tier, on every push: lint, type checks, unit tests with the coverage gate (core and net above 80 %), the API check and the docs build on Linux; unit and VS Code extension tests on Windows and macOS; the e2e suite on Linux; the desktop installers of the three systems. The full tier, nightly: the e2e suite on macOS, the benchmarks on Linux and macOS against the spec's absolute limits, the Android emulator and the iOS Simulator. Performance numbers per target are in `docs/benchmarks.md`.

## What is checked by hand

`MANUAL_TESTS.md` in the repository lists, by device, the steps and expected results of everything CI cannot run:

- real gamepads (Xbox, PlayStation, Switch Pro, a generic pad) in the browser and the desktop apps of each OS, with rumble, trigger rumble and the light bar;
- real Android phones and iPhones: offline start, touch, back button, pause and resume, saves with the Keystore and Keychain, the iOS deep link, release signing, Play Games and Game Center;
- NF-01, NF-02 and NF-03 on the reference phones (Samsung Galaxy A54, iPhone 12), which have not been measured yet;
- a real Windows PC: the e2e suite, the benchmarks, Firefox with a real GPU and an online match between two Windows PCs;
- the desktop apps on Windows 10, macOS 12 and Ubuntu 22.04, the first launch after a reboot, and the first launch under Rosetta on Apple silicon;
- the Steam client (achievements, Cloud, rich presence, overlay, depot upload) and Discord presence;
- signing and notarization with real certificates (Windows certificate or Azure Trusted Signing, Apple Developer ID and notarization);
- OIDC sign-in against a real provider, the reference server under Docker, telemetry with a real backend;
- the VS Code extension as a person sees it;
- the GitHub release itself: the Pages registry, a game created from the release on a clean machine, the `.vsix`, and `blacklight upgrade` after the next release.

## Accepted limitations

- **Shaders cannot read the UI.** Menus are HTML over the canvas; effects that must distort them run on the FX layer or render the component into the canvas.
- **Floating point differs between V8 and JavaScriptCore.** Online simulation code must use the engine's deterministic math; a lint rule enforces it.
- **The Steam overlay may not show in Electron** on some systems and GPUs; achievements, Cloud and rich presence work either way.
- **Client-side protection deters, it does not guarantee.** Encrypted saves, obfuscation, bytecode and blocked devtools stop casual cheating; fairness between players needs a server.
- **Bytecode follows the Electron version**, and the page's code is obfuscated rather than compiled.
- **No controller motion sensors.** The SDL binding (@kmamal/sdl 0.11) exposes no gyroscope or accelerometer; `hasGyro` is `false`.
- **No Steam leaderboards.** steamworks.js 0.4.0 does not expose them; scores go to the reference server.
- **Benchmarks in CI check absolute limits only** (a deviation from SPEC §11.1). Shared runners vary by more than 10 %, so the regression gate runs locally with `pnpm bench`. CI runners have no real GPU, so the 60 fps limit is checked only on a real GPU.
- **NF-01, NF-02 and NF-03 are not yet measured on the reference phones.** They are measured on a desktop, an Android emulator and CI runners; the phones are in `MANUAL_TESTS.md`. These three requirements stay open in `PROGRESS.md` until then.
- **No Windows e2e or benchmarks in CI.** GitHub's Windows runners have no GPU; on Windows CI runs the unit tests, the VS Code extension tests and the installer build, and the rest runs on a real Windows PC.
- **NF-05 minimum versions are checked by hand.** CI runs the current runner images and one build of each browser engine; Windows 10, macOS 12, Ubuntu 22.04, Android 8, iOS 15 and the previous version of each browser are in `MANUAL_TESTS.md`.
- **Distribution is GitHub only.** No npm packages, no VS Code Marketplace or Open VSX listing; the documentation site is built locally or deployed by the game's developer, not hosted by the project.
- **No default accounts provider.** A game that signs players in configures its own OIDC issuer; without one, sign-in is hidden and guests play.
