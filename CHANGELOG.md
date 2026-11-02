# Changelog

Generated from the git history by `pnpm changelog` (`scripts/changelog.mjs`); do not edit by hand.
Versions follow [semantic versioning](https://semver.org) as described in `CONTRIBUTING.md`.

## Unreleased

### accounts-oidc

- issuer required in the config input type, still checked at setup with its own message (4778c15)
- no built-in provider, issuer required; release CSP derives connect-src from it (a65b314)

### api-check

- pass entry points to TypeDoc with forward slashes (1a6cecf)

### bench

- absolute fps and 3D budget only on a real GPU, virtual and software adapters excluded (98364ad)
- limits-only mode for CI (f2dbc90)
- an Android WebView Playwright cannot attach to reports what its DevTools server answers (0652f86)
- a web cold start that misses the limit reports its open requests and game state (3201db2)
- Android emulator baseline of the development machine (WebView 156) (7dabd2a)
- NF-01, NF-02 mobile and NF-03 on an Android emulator (release app, pnpm bench with BLACKLIGHT_E2E_ANDROID=1) (4557385)
- peak memory (peakPssMb) gated on the median session, lower is better (09471c0)
- NF-02 cold start of the packaged desktop app and the web build (pnpm bench) (3dc835a)
- shared baseline step for the benchmark specs; cold start gated on the median with a two-frame floor (1725b38)

### build

- workspace for official modules, registry and servers (eb20135)

### chore

- progress audit against SPEC 12 (phase 3d, PF-04, NF-05, phase 5) (edf8561)
- decisions and progress for GitHub releases and the Pages registry (b138b85)
- add .gitattributes for consistent line endings and binary file handling (df7ca3b)
- dedupe workspace globs after merge (2334150)
- format merged tracking files (bbc1808)
- ignore agent worktrees in .claude/ (726cb51)

### ci

- fast tier on push and pull request, full tier nightly and on dispatch (e1172f4)
- split the spec input with read -a instead of an unquoted variable (b07d73c)
- cache Electron downloads for the desktop packages (7bebe6c)
- shard e2e on runners of their own, one worker each; bench as its own job (e3cc962)
- raise the NF-07 branch coverage threshold of core and net to 80 % (1a4639a)
- enforce NF-07 unit coverage of core and net with pnpm test:coverage (cdda9c7)
- pnpm api:check gates the public API (NF-06); api-report.txt records it (750a55c)
- Android benchmarks in the android job, results uploaded as bench-results-android (5c5f774)
- run the benchmarks under xvfb on Linux for the packaged app's cold start (2e2beb3)
- run the NF-01 benchmark after the tests and upload its results (10c4b52)

### cli

- upgrade updates the lock file even where pnpm freezes it (CI) (44b5aac)
- blacklight upgrade, engine packages and official modules from the game's release, registry on GitHub Pages, hint for required module config (7e0abba)
- the iOS Simulator build is signed ad hoc so the Keychain accepts the save key (392db49)
- warm both SEC-10 workloads up before timing them (4ad3015)
- time SEC-10's obfuscation cost in paired rounds (35b62d3)
- compare native real paths for MOD-04, so Windows short names match (f273a07)
- document the @blacklight/cli/vite entry, with examples (621d4cb)
- patch the Pixi copy the game bundles for the release CSP; e2e: every template in Chromium, Firefox and WebKit (NF-05) (c107381)
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

- debug overlay test waits for the overlay state instead of two frames (8c2eca4)
- absorb float drift wherever game time meets a duration (3c9da37)
- make Pixi position on game objects move them like x and y (6db082f)
- test that rumble reaches only the player's own gamepads (bf5da3a)
- browser tests for rendering, sprites, audio, assets, debug overlay and DOM input (a5ed492)
- unit tests in headless Chromium (Vitest browser mode, Playwright provider) (3278a27)
- export test looks for a field name, not two digits random bytes can spell (ed248d8)
- DMath typed with the documented DeterministicMath interface instead of typeof its private functions (505a015)
- document the game, scenes, input, assets, audio, saves, security, modules, config and debug entries (6800b9f)
- document objects, behaviors, animation, collisions and math helpers (ad0b0fd)
- blacklight:interactive user timing mark after the entry scene's first frame (46a8a6b)
- input.updates counts input reads, for code that injects input (832eeb5)
- Fade.fadeIn() brings back an object faded out with destroy: false; turnTowards angle is in radians (aa01011)
- spawn props accept a number for scale (b58f028)
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

### core, three

- give onFrame listeners a named payload with the frame within the animation (a47331e)
- fire the end of a non-looping animation before its queued one (31a6b02)

### create

- engine dependencies are the release's tarball URLs; --engine-version, BLACKLIGHT_RELEASE_URL (2917686)
- write link: dependencies with forward slashes on every OS (1c6cc77)
- document the scaffold API, with examples (abdd958)

### create-blacklight

- --link maps @blacklight/module-* to packages/modules/* (f54101c)
- every project gets the build workflow for all targets (PF-09) (47f0606)

### decisions

- SEC-10 round length, SEC-02 run-as-Node check (9cb16b4)

### docs

- README for 1.0 (contents, templates, CI tiers, current limits) (234a05f)
- manual checklist grouped by device, Rosetta and release steps, stale entries removed (e963abb)
- CI and reference-phone benchmark tables, gyro and Steam leaderboard limitations (489ceb0)
- install, create and upgrade games from GitHub releases (086c6c7)
- Publishing guides and "What you need to provide" tables (3c49a64)
- CI tiers, Windows e2e and benchmarks on a real machine, flaky-test policy (9822e8d)
- add 'Start from a template' section and link in getting started guide (afd0b1a)
- examples open their code in a full-screen dialog; syntax palette for editors and snippets; exercise solution applies in the editor and reverts (fbd6b10)
- NF-07 done; how to run browser unit tests and the coverage gate (fb9c0d3)
- Android emulator numbers for NF-01, NF-02 and NF-03, method and limits; manual steps for the reference phones (d861fa7)
- PROGRESS NF-02 counts nine launches (eb813f6)
- NF-02 desktop cold start numbers, method and limits; manual steps for Windows, macOS and the first launch after a reboot (56343ff)
- decisions on guide captures and tutorial exercises; DOC-01, DOC-02 notes; docs:screenshots in CONTRIBUTING (e704750)
- link the related guides to their tutorials (fe1f503)
- Tutorials group in the sidebar and nav, overview page (c2611fc)
- transitions tutorial with exercises, starting and solution files and automatic checks (c9db69a)
- ui tutorial with exercises, starting and solution files and automatic checks (4d3f401)
- collisions tutorial with exercises, starting and solution files and automatic checks (100ea55)
- input tutorial with exercises, starting and solution files and automatic checks (64960a5)
- sprites tutorial with exercises, starting and solution files and automatic checks (0df81e4)
- behaviors tutorial with exercises, starting and solution files and automatic checks (f4064a2)
- objects tutorial with exercises, starting and solution files and automatic checks (ecd4c42)
- scenes tutorial with exercises, starting and solution files and automatic checks (9d269f5)
- tutorial exercises (BlExercise: task, live example with a Solution button, automatic check) and the camera tutorial; docs.spec runs every solution and its check (70ad95e)
- Install the tools page and getting-started pictures captured by e2e/guide-captures.spec.ts (pnpm docs:screenshots) (556c7a1)
- NF-01 gate method for a desktop in use, measured spread and detection power (0b9894c)
- NF-01 headless desktop numbers, benchmark decisions, manual steps for the reference phones (e3fb3ce)
- turnTowards takes the angle in radians (b90b34e)
- navigation for concepts, behaviors, recipes, API and playground; build steps (3283437)
- recipes, FAQ and migration guide (213ad10)
- playground page with a multi-file starter project and share links (36477d5)
- getting started guide built from a runnable project, with its e2e test (e672858)
- API reference generated from the package declarations with TypeDoc (5606117)
- concepts page and a live example for every concept (d32ec39)
- runner waits at most 100 ms per frame off screen; previews report each run (573e100)
- live examples for every UI widget and transition (371a99b)
- a page and a live example for each of the 19 behaviors (RT-06) (1027e33)
- deployment guides for web games, the docs site and playground, the registry and the servers (DOC-08) (4f983af)
- live example runner, CodeMirror editor and playground components (46f211c)
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

- rendering-heavy specs retry once more in the full CI tier; party-game draws less while fast-forwarding (cadc41b)
- NF-01 bench contexts block the PWA service worker (b53026d)
- platformer pause menu waits for each focus move before the next key (b88ba44)
- docs spec waits for the lazily loaded code editor and stops the first playground before the copy (510aa83)
- skip the two-browser relay match of net.spec on Windows (bc1a327)
- skip the two-browser online match on Windows in favour of the relay test (be0e3dc)
- RT-12 ignores real controllers on the machine through SDL's own hint (5bfdabd)
- Windows online check proves match start and netcode stepping within a bounded budget (7bc1fc6)
- PF-05 waits for Rosetta to translate the universal app's x86_64 slice (1d2414d)
- online Push-Push on Windows CI checks the match start and first checksums (80049be)
- a retry stops the dev server its failed attempt left running (9aae33b)
- Android bench runs again after losing its DevTools connection to adb (b72a708)
- universal Steam app check accepts Valve's fat libsteam_api and launches both slices (7f8caad)
- party-game online pages draw at 15 fps; Linux and macOS references (c5cfda0)
- Android bench page sees no reduced-motion preference; stall report (c528eb1)
- party-game online match at 960x540, pad inputs tied to the match step (1ed2091)
- Android bench attaches to the WebView over CDP through an adb forward (3805a1d)
- Firefox on Windows lifts the WebGL driver blocklist for the Basic Render Driver (c5e633f)
- SEC-02 run-as-Node launch passes the keystore switches, so macOS does not wait on the Keychain (44e1419)
- party-game title focus poll waits up to 60 s for a cold dev server (c3d702e)
- SEC-02 run-as-Node check waits for the game, quits it and kills packaged apps a test leaves behind (65f9d00)
- browsers.spec checks each browser offers WebGL 2 before judging a template (e1e4137)
- refuse a port another server still answers on; pwa retries on its own port and reports process activity when the level does not start (6cc0b80)
- macOS online Push-Push reference, macOS and Windows three arena references (7fbd4f2)
- PF-02 drops the fullscreen probe, reports fullscreenable in the window state (3fef2e4)
- party-game Windows references (e6dffe1)
- PF-02 probes fullscreen without the aspect ratio and in simple fullscreen (d1ac006)
- room for two software-rendered browsers in the online tests (fedc8fa)
- the SQLite file poll skips an OPFS entry gone since it was listed (8902b73)
- Windows runner times for first compiles and screenshots; 3D budget there (f517125)
- a dev server that misses its deadline is stopped; 120 s on Windows (385a719)
- iOS Simulator requests the save through a file in the app container (a00c4e5)
- iOS failure screenshots go through a file (92b6a76)
- bench sends a static GET again when the preview server reset its connection (80a1a87)
- Windows runner times for the platformer's first compiles and canvas screenshots (ad01967)
- PF-02 waits 15 s for the window manager, reports the window, always closes the app (cc58774)
- party-game waits 30 s for scene switches and screenshots; macOS references (61935cc)
- benchmarks wait for slow software GPUs and never hang on a WebView (340fc55)
- retry temporary folder removal; wait for the platformer HUD's first compile (18037b9)
- browser check clips a page screenshot to the canvas; no WebKit on Windows (a8d54a2)
- attach the Simulator screen and the app log when an iOS step times out (ed43879)
- 3D frame budget on hardware GPUs, relative cost under SwiftShader (0e0003a)
- mock Keychain for the desktop app on macOS (fb6a979)
- wait for what happened instead of wall-clock moments (7da5af1)
- the browser check counts every pixel of the canvas (8f194ac)
- party-game references per OS; macOS references of the UI gate (70facae)
- docs.spec holds the pointer down for a few steps when it tries an exercise (a2defdb)
- re-record the local benchmark baseline (best run, stepRelative) (463c494)
- bench looks up the baseline after the first run, once the GPU name is known; proof with 30 % more work (12064e0)
- bench gate keeps the best of five runs, measures five more before failing, proof with 20 % more work per frame (2b3f642)
- bench fixture measures frame throughput against a calibration loop, so the CPU's speed of the moment cancels out (7cb3dd4)
- bench fixture shows its result on screen and builds for phones in landscape (7eb9489)
- NF-01 benchmark spec (pnpm bench): desktop and phone viewports, 10 % regression check against a per-runner baseline, proof with injected frame work (a531187)
- NF-01 benchmark fixture: 300 animated sprites under an animated UI screen, measured in the page (1773672)
- party-game seeds each match and pauses on its first step (6bb82fe)
- party-game flow, release build and online match (ddf0f9c)
- every docs example runs and draws; a broken example fails; playground links round-trip (5735c19)
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

### e2e, vscode

- copied fixtures link each package to its real folder (6f234ab)

### eslint-plugin

- document the plugin configs and the deterministic rule's options (40719a5)
- blacklight/deterministic rule for online simulation code (d3ef2aa)

### mobile

- TSDoc and examples for the whole public API; base64 and not-found helpers marked internal (267d45a)
- every back press is seen, even two quick ones or one during a slow frame (78a4a27)
- register runners.android/ios for blacklight run, signing variables shared with doctor (ANDROID_KEYSTORE*, APPLE_TEAM_ID), doctor uses the build's JDK and SDK search (760aeaa)
- bind blobs as Capacitor SQLite expects per OS; e2e: raw sqlite protocol on the Android emulator (99008c2)
- align native calls with phase 3e (secure-storage get → null, module-sqlite names and value types, leaderboards submitScore/scores, sign-in before achievement calls) (d663f30)
- BlacklightGames native plugin (Play Games v2 on Android, opt-in; Game Center on iOS), Capacitor plugin manifest (09534f9)
- Capacitor platform (app-private files with atomic writes, Keystore/Keychain save key, native modules, lifecycle events) and the mobile() game plugin (06721db)

### modules

- API types written out as documented interfaces (573d61e)
- document every public symbol; config options as named, documented interfaces (8ad250f)
- http, sqlite, cloud-save, accounts-oidc, achievements, telemetry (bdee6ab)

### native

- the game window stays fullscreenable on macOS when it starts windowed (d1ff6e0)
- no aspect fit while the window switches to or from fullscreen (271d8fd)
- data folder follows the path rules of the platform it is computed for (379a84a)
- TSDoc and examples for the game, define-native, main and build entries; main-process Discord client and data-folder helpers marked internal (c0ee6a8)
- build after @blacklight/net (the bundled LAN relay imports its protocol) (0a4c95b)
- deb maintainer and desktop name; ci: Electron e2e under Xvfb and installer builds on each OS (c368893)
- LAN relay module and desktop runners for blacklight run (95d2748)
- unit tests for the bridge, files, keystore, modules, Discord, SDL, Steam and build helpers (ae7aa81)
- run defineNative modules, secure-storage, deep links and Steam names for 3e modules (8ec6378)
- Electron desktop app, IPC bridge, SDL, Steam, Discord; cli: desktop targets, sign, upload, hardening plugin (3cff197)
- defineNative contract for module native parts (4914bbf)

### net

- test LAN hosting through the platform and its web error message (b824e2c)
- document the protocol messages, session events, stats and the test harness; NetworkStats names the simulated network's counters (bdf757f)
- rollback and lockstep sessions, relay client, network test harness (9d77214)

### nf-04

- core size test (59.6 KB gzip) and docs/benchmarks.md (fdfc0da)

### packages

- repository links point at beedywool/blacklight-engine, podspec tags with v (ef6c645)

### party-game

- drive the mini-game banner from the referee clock (9d74854)
- Air Hockey always reaches a result (face-offs, board spin, faster minimum speed) (1c601be)
- README (flow, mini-games, online, accounts, limits) (fdc4540)
- end panel menu arms once confirm is released (61cd2c1)
- card art by asset path; party badges out of the title (7d3db2b)
- title, join screen, game cards, match shell and results (c6135f5)
- shared mini-game base and the six mini-games, offline and online (50fa216)
- generated placeholder art and sounds (CC0) (e42ce94)

### physics

- document world and body options, the Rapier handles and configurePhysics with an example (3a69442)

### progress

- phase 4 gate, DOC-05 and DOC-06; Air Hockey and e2e decisions (608c9b8)
- DOC-01 to DOC-04 and RT-06; decisions, licenses and manual steps for the docs (6a199a3)
- phase 4c (PF-01, PF-06, PF-09, DOC-05 to DOC-08); decisions, manual tests, licenses (598bff8)
- phase 3a UI complete (UI-08…UI-11, UI-14…UI-19); decisions, manual tests, licenses (adcef4f)
- TL-01 notes add/search/publish from 3e (5e2e299)

### readme

- how to run, build and preview the docs (9a98fd3)

### registry

- release tarball URLs in the built index (--release-url, releaseTarballs) (0312e58)
- document every field of the manifest, package and index types, and RegistryError (d14dc35)
- index format, validator, static API generator; cli: add, search, publish (70af605)

### relay

- two headless party-game instances play Push-Push online through the real relay (70b39c3)
- relay server with rooms, codes, lobby, LAN native module and Docker image (c52808d)

### release

- 1.0 summary at the top of the release notes (19655e6)
- GitHub release workflow with tarballs, vsix, notes and registry deploy; e2e of a packed release (3b77ed7)

### repo

- changelog generated from the git history, semver policy (DOC-07) (6bd8117)

### scripts

- changelog groups commit areas regardless of case (82ac752)
- api:check compares api-report.txt whatever its line endings (c407d84)
- api:check rejects typeof of a declaration that is not exported (db09252)
- api:check keeps its messages when piped (39033ce)
- pnpm api:check finds undocumented symbols, missing examples, any and default exports in the public API (c485be8)
- benchmark check gates stepRelative on the best run; frame rates only where the baseline kept up with the display (bfd153e)
- benchmark medians, 10 % comparison with a per-runner baseline, baseline update command (f783981)

### servers

- reference server for cloud saves, achievements, leaderboards and OIDC account linking (88f03ed)

### templates

- build for Steam without changes (Valve's test App ID); e2e covers the steam target (da51a37)
- every template builds for every target; e2e covers each folder (DOC-06) (4660926)
- platformer (DOC-05) (1018a48)
- visual-novel (Ink story in English, Japanese and Arabic, cutscene, gallery); e2e: phase 3a gate (3051cc5)
- add 2d-with-3d (aec9e39)

### test

- SEC-10 rounds last 100 steps of the CPU-time clock, so Windows' 15.6 ms ticks stay under 1 % (a250655)
- SEC-10 measures CPU time, alone after the other test files (e0c43fe)
- games update through the stores only (PF-08) (52a21e4)
- vitest projects under servers/ by config file (d8632ad)
- deployment guides are in the sidebar, give commands and limits (DOC-08) (7daa64e)
- match only server folders in the Vitest projects (7c5e574)
- keep servers/docker-compose.yml out of the vitest projects (7ca8efa)

### three

- document views, animator, loader, projection helpers and ModelPreview; ModelView declared with ModelViewProps and ModelViewEvents instead of Vue's inferred type with any (377c92b)
- add @blacklight/three (Model3D, shared WebGL context, render to texture, glTF loading) (0548b33)

### ui

- a reduced-motion timeline resolves on the next frame (7685b56)
- document the rest of the public API (runtime, composables, dialogue, focus, text, themes, prompts, FX, inspector) (b9c65b6)
- document every exported component, widget and screen with an example (69fcd10)
- count direction repeat by polls so a stalled frame does not repeat; e2e: press pad buttons for exactly one game step, advance dialogue until the line changes (00abe61)
- unit tests for transitions, rich text, dialogue, FX, world anchors, video, localization, accessibility, screens and inspector (8f57b51)
- transitions library, rich text, Ink dialogue, FX layer, localization, accessibility, ready-made screens, world anchors, video, inspector; cli: Ink compilation and font subsetting (83554dc)
- applyTimeline() plays timelines saved as .timeline.json (4a1e07d)

### vscode

- integration test compares the debug webRoot with Windows drive-letter case rules (2571834)
- short user-data folder for the integration tests (58fbbfb)
- integration tests run the game from the temporary folder's long path (eb76554)
- report the dev server's output when the integration tests cannot start it (a3cb3d4)
- UI preview lists focus states before it reports ready; snippet test waits for lazy snippets (bcbb73b)
- Blacklight Engine extension with editors, completion, asset browser and live debugging (44a97ac)

### other

- Windows signing through the developer's Azure Trusted Signing account (8a7e54c)
- Template workflow: list the developer's signing secrets, scope them per OS, skip signing with a notice (4a7a5d9)
- Build the macOS Steam depot as a universal app (d215a1e)
- Build the Steam target for the host architecture only (0155b39)
- Record party-game decisions, manual checks, assets and DOC-05 progress (9f2172c)
- Integrate phase 3: module-sqlite depends on native, servers compose, progress, README (860405e)
- Prepare phase 3: platform interface, CLI command and target registries (dc7a821)
- Phase 2: UI core (2dd4459)
- Phase 1: runtime (bd0386d)
- Phase 0: foundations (ef845d8)
