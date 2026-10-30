# Progress

One line per `SPEC.md` requirement: `- [x] ID · where · test`. A requirement is checked only when its acceptance test passes in CI; partial work is noted on an unchecked line.

## Phase gates

- [x] Phase 0 Foundations · `pnpm create blacklight` → empty project runs in the browser · e2e: `e2e/create-empty.spec.ts` (passes locally on Linux; CI matrix configured in `.github/workflows/ci.yml`, not yet run: no remote)
- [x] Phase 1 Runtime · animated character (`.anim.json`) moved by a behavior, collides, plays audio; screenshot matches; release build packs atlases and strips debug · e2e: `e2e/runtime.spec.ts` (local Linux)
- [x] Phase 2 UI core · Persona-style pause menu (templates/persona-menu) fully navigable by a simulated gamepad; screenshots at 1920×1080 and phone; release build loads screens and Kenney glyphs · e2e: `e2e/ui.spec.ts` (local Linux)
- [x] Phase 3a UI complete · templates/visual-novel: Ink dialogue with choices, variables, portraits, backlog and saves; scene, screen and in-scene transitions (iris, ink, shatter, slices… with screenshots); FX layer on the game and on a DOM logo (PixiRender); Japanese and Arabic (hot switch, CJK line breaking, RTL layout, IME); WebM VP9 alpha cutscene with subtitles, skipped by holding confirm; release build plays compiled Ink · e2e: `e2e/visual-novel.spec.ts` (local Linux)
- [x] Phase 3b Light 3D · glTF model between two 2D layers and inside a menu (RTT with filter + mask, Vue `<ModelView>`), Draco + KTX2 offline from the build, benchmark frame budget (templates/2d-with-3d) · e2e: `e2e/three.spec.ts` (local Linux; fps asserted on a hardware GPU, CPU budget everywhere)
- [x] Phase 3c Desktop · Electron e2e (app:// protocol, sandbox, bridge allowlist, saves in the OS folder, modified save rejected + backup, devtools shortcut ignored in release, window ratio/fullscreen/quit, SDL pads over IPC, packaged app: fuses verified, bytecode main, debug switches refused, steam depots dry run) and web release security checks · e2e: `e2e/desktop.spec.ts`, `e2e/security.spec.ts` (local Linux under Xvfb; Windows/macOS jobs in `.github/workflows/ci.yml`, not yet run: no remote); signing dry run: cli `desktop.spec.ts`
- [ ] Phase 3d Mobile — Android half passes: fixture + persona-menu template launch offline, real touch (adb input), back button, deep link, pause/resume, encrypted save read back after a restart, raw `sqlite` protocol on Capacitor SQLite (rows, blob, boolean, persisted), signed release APK with no WebView DevTools socket, on an API 36 x86_64 emulator · e2e: `e2e/mobile-android.spec.ts` (local Linux); web build with phone emulation + fake native side · e2e: `e2e/mobile-web.spec.ts`; iOS Simulator half · e2e: `e2e/mobile-ios.spec.ts` in CI job `ios` (macOS), not run yet: no macOS here
- [x] Phase 3e Modules & services · `blacklight add sqlite` (and accounts-oidc, achievements) in a fresh project through a static registry index, typed `game.modules`, sql.js persisted across reloads, OIDC login against a mock provider with account linking on the reference server, offline queues replayed when the network returns, release build · e2e: `e2e/modules.spec.ts` (local Linux)
- [x] Phase 3f Networking · 4 simulated players, 150 ms latency (+20 ms jitter), 2 % loss, 10 min of game time on the Push-Push online scene: no desync; V8 (Node, Chromium) and JavaScriptCore (WebKit; Bun locally) give the same checksums; two browsers play a live match through the relay · test: `packages/net/test/gate.spec.ts`, e2e: `e2e/net.spec.ts` (local Linux: WebKit skipped for missing system libraries, JavaScriptCore checked through Bun; CI installs WebKit)
- [x] Phase 3g Tooling · VS Code extension integration tests (@vscode/test-electron) for every TL-03 feature; hot reload keeps state · tests: `packages/vscode/test/integration/suite.ts` (12 tests, `pnpm --filter blacklight-vscode test:integration`, local Linux under Xvfb with VS Code 1.139), e2e `e2e/tooling.spec.ts`
- [x] Phase 4 Docs & templates · every docs example runs and draws in CI, a broken one fails (e2e docs.spec.ts, `pnpm typecheck`); all six templates scaffold, run with `blacklight dev` and build for web, host desktop and Android + iOS dry run (e2e templates.spec.ts); "Getting started" followed end to end (e2e getting-started.spec.ts)
- [ ] Phase 5 Release

## Runtime (RT)

- [x] RT-01 Loop · packages/core/src/loop.ts, game.ts · test: loop.spec.ts, e2e runtime.spec.ts
- [x] RT-02 Scenes · scene.ts, game.ts (goto + transitions, overlays, hostScene) · test: scene.spec.ts, e2e runtime.spec.ts "scenes host scenes…"
- [x] RT-03 Loading · scenes chunked by import.meta.glob (cli/src/vite.ts), `static assets` + scene assets/ preloaded, `game.loadingScreen`, `game.preload` · test: e2e runtime.spec.ts
- [x] RT-04 Registry · registry.ts, game.objectClass (local shadows global, suggestions) · test: systems.spec.ts, scene.spec.ts
- [x] RT-05 Objects · GameObject, Sprite/AnimatedSprite, Text (web + .fnt bitmap), Container, Graphics, Particles, TilemapLayer (+ Tiled import), Video (packages/core/src/objects), Model3D (packages/three) · test: scene.spec.ts, e2e runtime.spec.ts "every object type", three model3d.spec.ts, e2e three.spec.ts
- [x] RT-06 Behaviors · all 19 behaviors in behaviors/*, one docs page each (docs/behaviors/) with a live example (docs/examples/behaviors/) · test: scene.spec.ts, behaviors.spec.ts (all 19 exercised), e2e docs.spec.ts "every behavior, widget and transition has a live example" + "every live example runs, draws and logs no error"
- [x] RT-07 Animations · anim/animator.ts, schema/anim.schema.json · test: animator.spec.ts, e2e runtime.spec.ts (frame events)
- [x] RT-08 Sprite sheets · anim/sheets.ts, sheet-cache.ts, cli/src/atlas.ts · test: animator.spec.ts, cli project.spec.ts, e2e release build (atlas)
- [x] RT-09 Collisions · collision/* · test: collision.spec.ts, scene.spec.ts
- [x] RT-10 Physics · packages/physics (Rapier 2D) · test: physics.spec.ts
- [x] RT-11 Input · input/input.ts, bindings.ts (actions, rebinding saved in settings, last device, 8 players, join) · test: input.spec.ts, e2e runtime.spec.ts
- [x] RT-12 Gamepads · web/mobile: Gamepad API + SDL_GameControllerDB (core input/gamepad.ts); desktop: SDL in the Electron main process (packages/native/src/main/sdl.ts, @kmamal/sdl 0.11.13 + bundled DB), hot-plug, rumble, trigger rumble, LED, pads forwarded over IPC as standard gamepads (renderer/gamepads.ts) · test: input.spec.ts, native services.spec.ts (fake SDL), e2e desktop.spec.ts "RT-12"; gyro not exposed by the binding (docs/guide/desktop.md Limits); real pads in MANUAL_TESTS.md
- [x] RT-13 Audio · audio.ts (buses, fades, crossfade, loop points, positional, unlock, format choice) · test: e2e runtime.spec.ts; audible output in MANUAL_TESTS.md
- [x] RT-14 Tweens · tween.ts (Motion easings and springs on the game clock) · test: systems.spec.ts
- [x] RT-15 Events · events.ts, listen() on scenes/objects · test: systems.spec.ts
- [x] RT-16 Time and randomness · random.ts, timers.ts, game.time · test: systems.spec.ts, scene.spec.ts
- [x] RT-17 Camera · camera.ts, scene split screen · test: camera.spec.ts, e2e "split screen"
- [x] RT-18 Resolution · viewport.ts, game.safeArea · test: viewport.spec.ts, e2e
- [x] RT-19 Serializable state · scene.snapshot/restore, serialize.ts · test: scene.spec.ts
- [x] RT-20 Debug · debug/index.ts (F3–F8), dev-only import · test: e2e runtime.spec.ts (overlay shown in dev, absent from release)

## Light 3D (3D)

- [x] 3D-01 · packages/three (registers the glTF loader on import; lands in scene chunks only) · test: e2e three.spec.ts (no Three.js script or .glb at the 2D title, dev server and release build)
- [x] 3D-02 · packages/three/src/context.ts (Three renderer on Pixi's context, draws into Pixi's bound framebuffer, `resetState()` on both, rebinds Pixi's target) · test: context.spec.ts, e2e three.spec.ts (one Pixi reset per model per frame, no GL error, 2D drawn over the model)
- [x] 3D-03 · packages/three/src/model3d.ts, projection.ts (Pixi `RenderContainer` in the scene graph; 2D transform, layer, zIndex, hitbox, snapshots) · test: projection.spec.ts, model3d.spec.ts, e2e three.spec.ts (hero between the back layer and the front pillar, screenshot)
- [x] 3D-04 · model3d.ts `static renderToTexture`, preview.ts `ModelPreview`, ui.ts `<ModelView>` (@blacklight/three/ui) · test: model3d.spec.ts, e2e three.spec.ts (sepia filter + round mask on the portrait; model turning in the pause menu while paused)
- [x] 3D-05 · loader.ts (GLB/glTF, Draco and KTX2 decoders loaded on demand), animator.ts (`play`/`queue`/`onEnd`/`onFrame`, fallback, fixed step), view.ts (`static layers3d`: orthographic or perspective camera, ambient + sun per layer) · test: loader.spec.ts, animator.spec.ts, model3d.spec.ts, e2e three.spec.ts (Draco guard, KTX2 crate)
- [x] 3D-06 · core `AssetStore.registerLoader`, `GameObject.requiredAssets()`; decoders emitted by the game build from `three` · test: systems.spec.ts, model3d.spec.ts, e2e three.spec.ts (release build with every non-local request blocked; decoder .wasm files in dist)
- [x] 3D-07 · templates/2d-with-3d/scenes/bench (two animated 10 048-triangle models; fps and main-thread time) · test: e2e three.spec.ts (A54-sized viewport, CPU ×4: < 8.3 ms mean / 16.7 ms p95 per frame; 60 fps asserted on hardware GPUs, 60.0 measured on a Radeon RX 6650 XT); real phones in MANUAL_TESTS.md

## UI (UI)

- [x] UI-01 Vue 3 layer · packages/ui/src/runtime.ts, components/UiRoot.vue (virtual pixels, scaled with the canvas) · test: runtime.spec.ts, e2e ui.spec.ts (phone + 1080p)
- [x] UI-02 Screen stack · runtime.ts UiStack (open/push/pop/replace/modal/confirm, scene and global screens, transitions, modal blocks game input) · test: runtime.spec.ts, e2e ui.spec.ts
- [x] UI-03 Spatial focus · focus.ts, spatial.ts (4/8 directions, groups, wrap, trap, memory, sounds, pointer sync) · test: spatial.spec.ts, focus.spec.ts, e2e ui.spec.ts
- [x] UI-04 Input prompts · prompts.ts, InputPrompt.vue, Kenney Input Prompts 1.5 (CC0) in packages/ui/prompts, setPromptPack, follows device and rebinding · test: runtime.spec.ts, e2e ui.spec.ts (Xbox glyph, release build loads glyphs)
- [x] UI-05 Layout · Anchor.vue (9 points, safe area, UI scale saved in settings) · test: runtime.spec.ts (scale), e2e ui.spec.ts (HUD anchored)
- [x] UI-06 Shapes · Skew, Slant, Mask, NineSlice, outlines, offset shadows (components/*, styles.css) · test: e2e ui.spec.ts screenshots
- [x] UI-07 Timelines · timeline.ts, useTimeline (labels, sound cues, interruption, ui or game clock, reduced motion) · test: runtime.spec.ts, widgets.spec.ts
- [x] UI-08 Transitions · packages/ui/src/transitions.ts (effects usable as screen transitions, scene transitions via `game.transitions`, and `ui.cover()`), core `game.transitions` · test: transitions.spec.ts, core transitions.spec.ts, e2e visual-novel.spec.ts (iris on goto, ink cover, screenshots of every effect)
- [x] UI-09 Rich text · richtext.ts, components/RichText.vue (color, size, b/i/u, shake, wave, icon, input glyph, speed, pause; per-character spans; typewriter) · test: text.spec.ts, e2e visual-novel.spec.ts (typewriter, wave/shake lines)
- [x] UI-10 Dialogue · dialogue.ts (inkjs), components/DialogueBox.vue, screens/Backlog.vue, cli/src/ink.ts (.ink compiled at build) · test: dialogue.spec.ts, cli ink-fonts.spec.ts, e2e visual-novel.spec.ts
- [x] UI-11 FX layer · fx/filters.ts (glitch, halftone, blur, chromatic, distort), fx/fx-layer.ts (world and overlay targets, useFx, pulse, distort transition), components/PixiRender.vue (SVG foreignObject → texture) · test: fx-world-video.spec.ts, e2e visual-novel.spec.ts (halftone on the game, glitch on the rendered logo, pixels read back, `# fx` pulse)
- [x] UI-12 Themes · theme.ts (tokens → CSS variables, blacklight and persona, live switch saved in settings) · test: runtime.spec.ts, e2e ui.spec.ts (theme switch)
- [x] UI-13 Widgets · widgets/* (button, menu list, tabs, gauge with trail, counter, virtualized scroll list, inventory grid, slider, toggle, select, text input with IME + virtual keyboard, tooltip, toast, confirm dialog, radial menu) · test: widgets.spec.ts, e2e ui.spec.ts
- [x] UI-14 World-anchored UI · world.ts, components/WorldAnchor.vue, FloatingTextHost.vue (floatText, damageNumber) · test: fx-world-video.spec.ts, e2e visual-novel.spec.ts (tag follows the lantern, +1 on click)
- [x] UI-15 Localization · i18n.ts (locales/*.json, Intl.PluralRules, interpolation, hot switch, RTL, Intl.Segmenter line breaks), cli/src/fonts.ts (font subsetting in release builds), TextInput IME · test: text.spec.ts, cli ink-fonts.spec.ts, e2e visual-novel.spec.ts (ja + ar, IME composition)
- [x] UI-16 Accessibility · a11y.ts (text size, high contrast, daltonization filters, reduced motion, subtitles, text speed; saved as a11y.*) · test: screens.spec.ts, text.spec.ts, transitions.spec.ts
- [x] UI-17 Ready-made screens · screens/SettingsScreen.vue (audio, video, controls with rebinding, language, accessibility), PauseScreen.vue, SaveLoadScreen.vue over the `SaveSlots` interface (slots.ts, `fileSlots`) · test: screens.spec.ts, e2e visual-novel.spec.ts (save/load mid-dialogue, language tab)
- [x] UI-18 Dev UI inspector · inspector.ts (`@blacklight/ui/inspector`, F9, installed by the CLI in dev only) · test: screens.spec.ts, e2e visual-novel.spec.ts (dev shows it, release build does not contain it)
- [x] UI-19 Video · video.ts (sources WebM first / MP4 on Apple WebKit, WebVTT), components/VideoPlayer.vue, screens/Cutscene.vue, playCutscene, subtitle() · test: fx-world-video.spec.ts, e2e visual-novel.spec.ts (WebM VP9 alpha plays, subtitles, hold to skip); MP4 on Safari/iOS in MANUAL_TESTS.md

## Modules (MOD)

- [x] MOD-01 defineModule · packages/core/src/modules (define.ts, host.ts, schema.ts), `modules` in config.ts, game.modules / game.destroy, cli/src/modules.ts (virtual module + Register types) · test: core modules.spec.ts, cli modules.spec.ts, e2e modules.spec.ts (tsc on game.modules)
- [x] MOD-02 Context · packages/core/src/modules (config, events, ModuleSaves hook, network + OfflineQueue, logger, storage, platform) · test: core modules.spec.ts, http.spec.ts, cloud-save.spec.ts, e2e modules.spec.ts (offline replay)
- [x] MOD-03 Native part · defineNative/fn (packages/native/src/define-native.ts), Electron main registration (`registerDispatcher`, packages/native/src/main), Capacitor routing (packages/mobile) · test: native define-native.spec.ts, module-sqlite sqlite.spec.ts, e2e desktop.spec.ts (fixture module answered from its native part), mobile platform specs
- [x] MOD-04 node_modules · packages/cli/src/modules.ts (Node built-ins and native addons refused in game code, module deps pre-bundled) · test: cli modules.spec.ts
- [x] MOD-05 Registry · packages/registry (manifest, validator, static API, index template with CI workflow), cli/src/commands/registry.ts (add, search, publish) · test: registry.spec.ts, cli registry.spec.ts, e2e modules.spec.ts
- [x] MOD-06 Official modules · packages/modules/{http,sqlite,cloud-save,accounts-oidc,achievements,telemetry}; physics in packages/physics; discord from 3c · test: http.spec.ts, sqlite.spec.ts, cloud-save.spec.ts, accounts.spec.ts, achievements.spec.ts, telemetry.spec.ts, e2e modules.spec.ts

## Platforms (PF)

- [x] PF-01 Web/PWA · packages/cli/src/pwa.ts (manifest from game.config.ts, 192/512 icons, `sw.js` precaching every built file in a cache keyed by game id + build hash; web target only) · test: cli pwa.spec.ts, e2e pwa.spec.ts (platformer build: Chrome installability check with no errors, offline reload plays the level); installing on phones in MANUAL_TESTS.md
- [x] PF-02 Electron · packages/native/src/main/app.ts (app:// privileged scheme, contextIsolation + sandbox, no nodeIntegration, 3-member preload, validated allowlist, window ratio, fullscreen, quit) · test: native bridge.spec.ts, e2e desktop.spec.ts "PF-02" ×2
- [x] PF-03 Builds · cli targets/desktop.ts + native build/package.ts (NSIS + portable, dmg + zip x64/arm64, AppImage + deb) · test: native services.spec.ts "builds", e2e desktop.spec.ts (unpacked Linux package); AppImage + deb built locally; installers per OS in CI job `desktop-packages`
- [ ] PF-04 Capacitor Android and iOS — partial · packages/mobile, packages/cli/src/targets/mobile*.ts · test: mobile platform/plugin specs (packages/mobile/test), packages/cli/test/mobile.spec.ts, e2e/mobile-web.spec.ts, e2e/mobile-android.spec.ts (emulator, passes; `blacklight run --target android` checked by hand on it); iOS implemented (Xcode project generated and patched on Linux), Simulator run pending in CI
- [x] PF-05 Steam · native main/steam.ts (achievements, Cloud, rich presence, overlay with electronEnableSteamOverlay), build/steam.ts (depot VDFs, steamcmd), `blacklight upload --target steam --dry-run` · test: native services.spec.ts (fake Steamworks), e2e desktop.spec.ts "PF-05"; Steam client in MANUAL_TESTS.md
- [x] PF-06 Everything works offline; online features fail gracefully and resync · web: service worker (PF-01); desktop/mobile: embedded files; modules: offline queues · test: e2e pwa.spec.ts (offline reload plays, an uncached request fails with a catchable error, game keeps running), modules.spec.ts (offline queues replayed when the network returns), mobile-android.spec.ts (template launches offline), desktop.spec.ts (app:// local files)
- [x] PF-07 Signing and notarization · native build/sign.ts (plan from electron-builder variables), `blacklight sign --dry-run` (cli commands/desktop.ts), signing while packaging · test: cli desktop.spec.ts "sign --dry-run", native services.spec.ts "plans signing"; real certificates in MANUAL_TESTS.md
- [x] PF-08 Updates through stores only · no updater dependency anywhere, no `autoUpdater` in engine code, electron-builder `publish: null` (no update feed), PWA takes a new build on the next start (no `skipWaiting`) · test: scripts/updates.test.mjs, packages/native/test/services.spec.ts
- [x] PF-09 Template build workflow · packages/create/shared/_github/workflows/build.yml, written by create-blacklight into every new project whatever the template (web, win/mac/linux on their OS, android, ios on macos-26; signing from secrets) · test: create workflow.spec.ts (parsed jobs and matrix; actionlint when installed, in CI on Linux), e2e templates.spec.ts (every scaffolded template has it)

## Saves (SV)

- [x] SV-01 `game.save` · core save/manager.ts (slots, autosave, metadata incl. date/play time/thumbnail, list/load/delete, migrations) · test: core save.spec.ts, e2e desktop.spec.ts "SV-01"
- [x] SV-02 Default location · native main/files.ts (`%APPDATA%`, `~/Library/Application Support`, `$XDG_DATA_HOME`, `save.location` override), IndexedDB on the web · test: native bridge.spec.ts "data folder", e2e desktop.spec.ts (folder checked)
- [x] SV-03 Encryption + HMAC · core save/format.ts (AES-256-GCM, HMAC-SHA-256), key from Electron safeStorage (native main/keystore.ts) or non-extractable WebCrypto · test: core save.spec.ts, native bridge.spec.ts "save key", e2e desktop.spec.ts + security.spec.ts (modified save rejected)
- [x] SV-04 Atomic writes + backup · native main/files.ts (temp + fsync + rename), save manager backup of valid files only, corrupted save offers the backup · test: native bridge.spec.ts, core save.spec.ts, e2e desktop.spec.ts and security.spec.ts ("tampered+backup")
- [x] SV-05 Password export/import · core save/format.ts (PBKDF2 600k + AES-GCM, game id checked) · test: core save.spec.ts "export and import"
- [x] SV-06 Cloud saves · sync and conflict rules in core (`useCloud`, `sync`, newest or player choice) + `ModuleSaves` for the cloud-save module (3e) + Steam Cloud provider (`steam(game).cloud`) · test: core save.spec.ts "cloud saves hook" and "ModuleSaves", cloud-save.spec.ts (3e)
- [x] SV-07 Dev plain saves · core save/config.ts (encryption off in dev), readable JSON · test: core save.spec.ts "dev builds write readable JSON"

## Production hardening (SEC)

- [x] SEC-01 DevTools blocked · core security/runtime.ts (keys, context menu), native main (devTools off, before-input-event, no menu, debug switches refused when packaged) · test: core security.spec.ts, e2e desktop.spec.ts "SEC-01" (+ dev positive control) and "SEC-02, SEC-04" (switches), security.spec.ts "SEC-01"
- [x] SEC-02 Fuses + ASAR integrity · native build/package.ts (electronFuses, asar) · test: e2e desktop.spec.ts (fuse wire read from the packaged binary, ELECTRON_RUN_AS_NODE ignored, --inspect refused)
- [x] SEC-03 Obfuscation · cli security.ts (javascript-obfuscator on game chunks, low/medium/high) · test: cli desktop.spec.ts, e2e security.spec.ts "SEC-03"
- [x] SEC-04 V8 bytecode · native build/bytecode.ts (bytenode, compiled in an Electron main process; main process only, see docs) · test: e2e desktop.spec.ts (packaged app runs from blacklight-main.jsc, no source)
- [x] SEC-05 Protected values · core security/protect.ts, runtime.ts (`security.protect`) · test: core security.spec.ts, e2e security.spec.ts "SEC-05"
- [x] SEC-06 Debugger detection · core security/runtime.ts (timed `debugger`, kept through minification), native devtools-opened report · test: core security.spec.ts, e2e security.spec.ts "SEC-06" (CDP debugger attached)
- [x] SEC-07 WebView not inspectable · `security.webview` (core security/config.ts, `resolveSecurity`), applied to `webContentsDebuggingEnabled` by the mobile build (cli targets/mobile-native.ts, 3d) · test: core security.spec.ts, cli desktop.spec.ts "SEC-07 switch", e2e mobile-android.spec.ts (no WebView DevTools socket in the release APK, 3d)
- [x] SEC-08 Strict CSP, no eval · core contentSecurityPolicy, cli hardening plugin (meta tag, pixi.js/unsafe-eval), desktop header · test: core security.spec.ts, e2e security.spec.ts "SEC-08", desktop.spec.ts (EvalError, header)
- [x] SEC-09 Tamper reaction · `game.on('tamper')`, default restore + log, `onTamper: 'quit'` · test: core security.spec.ts "tamper reaction", e2e security.spec.ts
- [x] SEC-10 Cost ≤ 10 % · default level `low` (measured ×1.04, `medium` ×1.30); bytecode covers the main process only (no per-frame cost) · test: cli desktop.spec.ts "costs at most 10 %"

## Networking (NET)

- [x] NET-01 Relay server (Node, Docker image) · servers/relay (rooms, codes, lobby, WebSocket, `startRelay`, `relayNativeModule` for LAN), packages/net/src/relay-client.ts, lan.ts · test: servers/relay/test/relay.spec.ts, e2e/net.spec.ts (live match); Docker image checked by hand (MANUAL_TESTS)
- [x] NET-02 Rollback · packages/net/src/rollback.ts, scene-rollback.ts (prediction, rollback ≤ 8 steps, adjustable delay, RT-19 restore, checksums + desync report, 8 players, spectators incl. late join) · test: packages/net/test/rollback.spec.ts, scene-rollback.spec.ts, gate.spec.ts
- [x] NET-03 Determinism · packages/core/src/dmath.ts (`DMath`), packages/eslint-plugin (`blacklight/deterministic`) · test: packages/core/test/dmath.spec.ts (golden fingerprint), packages/eslint-plugin/test/deterministic.spec.ts, e2e/net.spec.ts (same bits on JavaScriptCore)
- [x] NET-04 Lockstep mode for turn-based games · packages/net/src/lockstep.ts · test: packages/net/test/lockstep.spec.ts
- [x] NET-05 Test harness · packages/net/src/testing.ts (`SimulatedNetwork`, `simulateMatch`, `headlessGame`) · test: packages/net/test/rollback.spec.ts, gate.spec.ts

## Platform services (SVC)

- [x] SVC-01 Accounts · packages/modules/accounts-oidc (PKCE S256, system browser, web redirect, custom-scheme deep link, refresh token in secure storage, BlackLight SSO preset, server linking) · test: accounts.spec.ts (desktop flow with simulated deep link), e2e modules.spec.ts (web flow against the mock provider); real SSO and devices in MANUAL_TESTS.md
- [x] SVC-02 Achievements · packages/modules/achievements (Steam, Game Center, Play Games through platform.invoke, reference server, offline queue) · test: achievements.spec.ts, e2e modules.spec.ts; real stores in MANUAL_TESTS.md
- [x] SVC-03 Discord Rich Presence · native main/discord.ts (own client of the local RPC protocol: presence, party, join, ask-to-join), renderer `discord(game)` · test: native services.spec.ts (fake Discord socket); real Discord in MANUAL_TESTS.md
- [x] SVC-04 Telemetry and crash reports · packages/modules/telemetry (opt-in, consent helper, Sentry envelopes, scrubbing, offline queue) · test: telemetry.spec.ts; real backend in MANUAL_TESTS.md
- [x] SVC-05 Reference server · servers/reference (cloud saves, achievements/leaderboards, OIDC account linking) and servers/relay, both in servers/docker-compose.yml · test: servers/reference/test/*.spec.ts, servers/relay/test/relay.spec.ts; Docker run in MANUAL_TESTS.md

## Tooling (TL)

- [x] TL-01 CLI · create, dev, build --target web|win|mac|linux|steam|android|ios, preview, types, run (runners for web, desktop, mobile), doctor, lint, add/search/publish (3e), sign --dry-run and upload --dry-run (3c) · test: cli tools.spec.ts, desktop.spec.ts, mobile.spec.ts, registry.spec.ts
- [x] TL-02 Hot reload · cli/src/tooling.ts (HMR code for scene/object modules), core/src/debug/hot.ts (scene rebuilt + snapshot restored, objects patched in place), Vue HMR via @vitejs/plugin-vue · test: core tooling.spec.ts, cli tools.spec.ts, e2e tooling.spec.ts "hot reload keeps the state of scenes, objects and screens"
- [x] TL-03 VS Code extension · packages/vscode (new scene/object, snippets + completion, sprite-sheet slicer, `.anim.json` editor + JSON Schemas, scene editor + `scene.load(layout)`, UI preview with focus states, UI timeline editor + `applyTimeline`, `game.config.ts` form, asset browser, debugging: launch config, Live Objects, debug channel) · test: vscode integration suite.ts (one test per feature), vscode unit core.spec.ts + webviews.spec.ts, core tooling.spec.ts, ui timeline-json.spec.ts, e2e tooling.spec.ts "the debug channel…"; Marketplace/Open VSX publishing is a dry run (`publish:dry-run`), real publish in MANUAL_TESTS.md

## Documentation and templates (DOC)

- [x] DOC-01 VitePress site · getting started, concepts, one guide per subsystem, 19 behavior pages, recipes (docs/recipes/), FAQ, migration guide, API reference generated by TypeDoc for 20 package entries (docs/scripts/api.mjs, part of `pnpm docs:build`) · test: `pnpm docs:build` (fails on dead links), e2e docs.spec.ts "the docs load nothing from other origins"
- [x] DOC-02 Live-editable examples · `<LiveExample>` (docs/.vitepress/theme: CodeMirror 6 editor + runner iframe, re-run 600 ms after each edit) for every concept, the 19 behaviors, 16 widgets, 14 transitions and the recipes · test: e2e docs.spec.ts
- [x] DOC-03 Examples type-checked and run in CI · `pnpm typecheck` runs tsc over docs/examples and the playground, vue-tsc over getting-started; e2e checks every preview for runner errors, console errors and a drawn canvas · test: e2e docs.spec.ts "every live example runs…", "a broken example fails the check", "a type error in an example fails pnpm typecheck"
- [x] DOC-04 Playground · docs/playground.md (`BlPlayground`): multi-file project (config, scene, two objects, `.anim.json` + sheet, two screens), add/delete files, replace images, live run, share URL in `#project=` · test: e2e docs.spec.ts "the playground runs a project and restores it from its share URL"
- [x] DOC-05 Templates · create-blacklight lists every folder of templates/: empty, party-game (six mini-games offline and online), visual-novel, persona-menu, platformer, 2d-with-3d · test: e2e templates.spec.ts, party-game.spec.ts, platformer.spec.ts, visual-novel.spec.ts, ui.spec.ts, three.spec.ts, templates/party-game/test/*.spec.ts
- [x] DOC-06 Each template runs with `blacklight dev` and builds for every target · all six templates depend on @blacklight/native; `create-blacklight --link` maps @blacklight/module-* to packages/modules/* · test: e2e templates.spec.ts (iterates templates/*: scaffold, dev, web, host desktop unpacked, steam (depot staged + scripts; templates ship Valve's test App ID 480), android + ios dry run); full native builds in CI jobs desktop-packages, android, ios
- [x] DOC-07 Open source · README, CONTRIBUTING (semver policy, release steps), code of conduct, issue/PR templates, MIT license, THIRD_PARTY_LICENSES.md, CHANGELOG.md generated by `pnpm changelog` (scripts/changelog.mjs) · test: scripts/changelog.test.mjs, scripts/open-source.test.mjs
- [x] DOC-08 Deployment guides · docs/guide/deploy-web.md (PWA), deploy-docs.md (docs site + playground), deploy-registry.md, deploy-server.md (reference server, relay, compose, TLS proxies) · test: scripts/deploy-guides.test.mjs, `pnpm docs:build` (dead links)

## Non-functional (NF)

- [ ] NF-01 Stable 60 fps on a Samsung Galaxy A54 and an iPhone 12 — partial · benchmark scene e2e/fixtures/bench (300 AnimatedSprites + animated Vue screen) measured headless at 1920×1080 and the A54 viewport, CI fails on a regression > 10 % against the runner's baseline (e2e/bench-baseline.json); numbers in docs/benchmarks.md · test: e2e/bench.spec.ts (`pnpm bench`), scripts/bench.test.mjs. Still to do: Android emulator run, the reference phones (MANUAL_TESTS.md), CI baselines from the first green main run
- [ ] NF-02 Cold start under 3 s on desktop; first interactive screen…
- [ ] NF-03 Under 300 MB memory on mobile for the party-game…
- [x] NF-04 Core size · `@blacklight/core` main bundle 59.6 KB gzip without Pixi, Vue and Three (Motion included), lazy gamepad database 44.9 KB apart; reported in docs/benchmarks.md · test: packages/cli/test/core-size.spec.ts (fails at 150 KB)
- [ ] NF-05 Support — partial · browsers: the release build of every template starts, draws and takes keys and pointer in Chromium, Firefox and WebKit (Safari's engine) · test: e2e browsers.spec.ts (WebKit skipped where Playwright cannot install its libraries, e.g. this Arch-based machine; runs in CI). Still to check: the OS matrix (Windows 10+, macOS 12+, Ubuntu 22.04+) and Android 8 / iOS 15 in CI; "last two versions" of each browser is one Playwright build per engine plus MANUAL_TESTS.md
- [ ] NF-06 Fully typed, documented public API; semver from 1.0.
- [ ] NF-07 Tests — unit coverage of core 50 % (browser-only code is covered by e2e only); needs browser-mode unit tests to reach 80 %
