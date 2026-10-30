# Changelog

Generated from the git history by `pnpm changelog` (`scripts/changelog.mjs`); do not edit by hand.
Versions follow [semantic versioning](https://semver.org) as described in `CONTRIBUTING.md`.

## Unreleased

### build

- workspace for official modules, registry and servers (eb20135)

### chore

- dedupe workspace globs after merge (2334150)
- format merged tracking files (bbc1808)
- ignore agent worktrees in .claude/ (726cb51)

### cli

- web builds are installable PWAs that run offline (PF-01) (ebc533e)
- release CSP without eval for embind WebAssembly (KTX2 transcoder) (3ecc937)
- tests for desktop targets, sign dry-run and the SEC-10 obfuscation benchmark (5338754)
- format tools test (b07a2b5)
- test run --target web (63295fb)
- android and ios targets (generated Capacitor project, Gradle and Xcode builds, signing from env, --run, runMobile) (1522264)
- pre-bundle the browser dependencies of linked module packages (9215dc9)
- dedupe three like pixi.js and vue (e63dca0)
- modules from game.config.ts in the generated entry and types; refuse Node imports in game code (1db3e82)
- hot reload of scenes and objects, debug channel relay, tooling e2e (398756b)
- doctor, lint and run commands, runners registry (cd40c1c)

### core

- game.save.screenSlots() adapts saves to the UI's save/load screens; summary in save metadata (9d0cbb3)
- saves implement ModuleSaves for modules; CSP test covers blob workers (7653eaa)
- type the custom loader test (baeb321)
- keep position fields out of snapshot data (0dd42e6)
- save manager, security runtime, release flag and config validation for saves, security and desktop (c4ca53f)
- scene.load(layout), hot reload hooks and debug channel for tooling (4b99d0a)
- deterministic math (DMath) in simulation code; exact rollback restore (8d4048e)
- module host, schemas, offline queue and game.modules (f487376)
- preload files an object class requires besides static assets (d6713d6)
- let packages register loaders for extra asset types (575d448)
- validate the mobile section of game.config.ts (orientation, statusBar, keepAwake, playGamesAppId, gameCenter) (c67839f)
- named scene transitions and locales config (39d75c1)

### create-blacklight

- every project gets the build workflow for all targets (PF-09) (47f0606)

### docs

- save/load screens over game.save (5cf3688)
- decision for the SEC-07 mobile switch (c14c0d9)
- phase 3c progress, decisions, manual tests and licenses (5a58b0b)
- desktop and Steam, saves, production hardening (3c8fe58)
- phase 3d progress after the merges (aededd1)
- UI transitions, rich text, dialogue, FX layer, world anchors, localization, accessibility, ready-made screens, video, inspector (cfc4584)
- command line tools, hot reload and VS Code extension guides; tooling progress, decisions, manual tests (d1314f0)
- Android and iOS guide, mobile decisions, manual tests, licenses, progress (a990696)
- phase 3e progress, decisions, manual tests and licenses (b160cd3)
- 3D models and render to texture; record phase 3b progress and decisions (4ebf1cb)
- networking guide (rooms, rollback, lockstep, determinism, testing, relay server); progress for NET-01…05 (b494de9)
- modules, native parts, accounts, achievements guides and sidebar (7764c06)

### e2e

- offline play and installability of a web build (PF-01, PF-06) (89279fe)
- release security checks (CSP, devtools keys, obfuscation, protected values, debugger, modified save); cli: keep debugger statements for SEC-06 (e40e34e)
- wait for the KTX2 crate texture; two Playwright workers (1783332)
- hot reload test compares ticks to the paused value (b342137)
- transition library screenshots; ui: ink effect blobs (b8e1aec)
- signed Android release build has no WebView DevTools socket (SEC-07); README package row (90c6294)
- press pad buttons for one step instead of a fixed time (9ce41ac)
- mobile gate on the Android emulator, iOS Simulator and in Chromium with a fake native side; CI jobs android and ios (f081854)
- phase 3e gate (blacklight add, OIDC login against a mock provider, offline queue replay) (4daf565)
- Push-Push online fixture and networking gate (V8 vs JavaScriptCore, live relay match) (c29f634)
- phase 3b gate for light 3D (693afa3)

### eslint-plugin

- blacklight/deterministic rule for online simulation code (d3ef2aa)

### mobile

- register runners.android/ios for blacklight run, signing variables shared with doctor (ANDROID_KEYSTORE*, APPLE_TEAM_ID), doctor uses the build's JDK and SDK search (760aeaa)
- bind blobs as Capacitor SQLite expects per OS; e2e: raw sqlite protocol on the Android emulator (99008c2)
- align native calls with phase 3e (secure-storage get → null, module-sqlite names and value types, leaderboards submitScore/scores, sign-in before achievement calls) (d663f30)
- BlacklightGames native plugin (Play Games v2 on Android, opt-in; Game Center on iOS), Capacitor plugin manifest (09534f9)
- Capacitor platform (app-private files with atomic writes, Keystore/Keychain save key, native modules, lifecycle events) and the mobile() game plugin (06721db)

### modules

- http, sqlite, cloud-save, accounts-oidc, achievements, telemetry (bdee6ab)

### native

- build after @blacklight/net (the bundled LAN relay imports its protocol) (0a4c95b)
- deb maintainer and desktop name; ci: Electron e2e under Xvfb and installer builds on each OS (c368893)
- LAN relay module and desktop runners for blacklight run (95d2748)
- unit tests for the bridge, files, keystore, modules, Discord, SDL, Steam and build helpers (ae7aa81)
- run defineNative modules, secure-storage, deep links and Steam names for 3e modules (8ec6378)
- Electron desktop app, IPC bridge, SDL, Steam, Discord; cli: desktop targets, sign, upload, hardening plugin (3cff197)
- defineNative contract for module native parts (4914bbf)

### net

- rollback and lockstep sessions, relay client, network test harness (9d77214)

### progress

- phase 3a UI complete (UI-08…UI-11, UI-14…UI-19); decisions, manual tests, licenses (adcef4f)
- TL-01 notes add/search/publish from 3e (5e2e299)

### registry

- index format, validator, static API generator; cli: add, search, publish (70af605)

### relay

- relay server with rooms, codes, lobby, LAN native module and Docker image (c52808d)

### servers

- reference server for cloud saves, achievements, leaderboards and OIDC account linking (88f03ed)

### templates

- every template builds for every target; e2e covers each folder (DOC-06) (4660926)
- platformer (DOC-05) (1018a48)
- visual-novel (Ink story in English, Japanese and Arabic, cutscene, gallery); e2e: phase 3a gate (3051cc5)
- add 2d-with-3d (aec9e39)

### test

- keep servers/docker-compose.yml out of the vitest projects (7ca8efa)

### three

- add @blacklight/three (Model3D, shared WebGL context, render to texture, glTF loading) (0548b33)

### ui

- count direction repeat by polls so a stalled frame does not repeat; e2e: press pad buttons for exactly one game step, advance dialogue until the line changes (00abe61)
- unit tests for transitions, rich text, dialogue, FX, world anchors, video, localization, accessibility, screens and inspector (8f57b51)
- transitions library, rich text, Ink dialogue, FX layer, localization, accessibility, ready-made screens, world anchors, video, inspector; cli: Ink compilation and font subsetting (83554dc)
- applyTimeline() plays timelines saved as .timeline.json (4a1e07d)

### vscode

- UI preview lists focus states before it reports ready; snippet test waits for lazy snippets (bcbb73b)
- Blacklight Engine extension with editors, completion, asset browser and live debugging (44a97ac)

### other

- Integrate phase 3: module-sqlite depends on native, servers compose, progress, README (860405e)
- Prepare phase 3: platform interface, CLI command and target registries (dc7a821)
- Phase 2: UI core (2dd4459)
- Phase 1: runtime (bd0386d)
- Phase 0: foundations (ef845d8)
