# Progress

One line per `SPEC.md` requirement: `- [x] ID · where · test`. A requirement is checked only when its acceptance test passes in CI; partial work is noted on an unchecked line.

## Phase gates

- [x] Phase 0 Foundations · `pnpm create blacklight` → empty project runs in the browser · e2e: `e2e/create-empty.spec.ts` (passes locally on Linux; CI matrix configured in `.github/workflows/ci.yml`, not yet run: no remote)
- [x] Phase 1 Runtime · animated character (`.anim.json`) moved by a behavior, collides, plays audio; screenshot matches; release build packs atlases and strips debug · e2e: `e2e/runtime.spec.ts` (local Linux)
- [x] Phase 2 UI core · Persona-style pause menu (templates/persona-menu) fully navigable by a simulated gamepad; screenshots at 1920×1080 and phone; release build loads screens and Kenney glyphs · e2e: `e2e/ui.spec.ts` (local Linux)
- [ ] Phase 3a UI complete
- [x] Phase 3b Light 3D · glTF model between two 2D layers and inside a menu (RTT with filter + mask, Vue `<ModelView>`), Draco + KTX2 offline from the build, benchmark frame budget (templates/2d-with-3d) · e2e: `e2e/three.spec.ts` (local Linux; fps asserted on a hardware GPU, CPU budget everywhere)
- [ ] Phase 3c Desktop
- [ ] Phase 3d Mobile — Android half passes: fixture + persona-menu template launch offline, real touch (adb input), back button, deep link, pause/resume, encrypted save read back after a restart, signed release APK with no WebView DevTools socket, on an API 36 x86_64 emulator · e2e: `e2e/mobile-android.spec.ts` (local Linux); web build with phone emulation + fake native side · e2e: `e2e/mobile-web.spec.ts`; iOS Simulator half · e2e: `e2e/mobile-ios.spec.ts` in CI job `ios` (macOS), not run yet: no macOS here
- [x] Phase 3e Modules & services · `blacklight add sqlite` (and accounts-oidc, achievements) in a fresh project through a static registry index, typed `game.modules`, sql.js persisted across reloads, OIDC login against a mock provider with account linking on the reference server, offline queues replayed when the network returns, release build · e2e: `e2e/modules.spec.ts` (local Linux)
- [x] Phase 3f Networking · 4 simulated players, 150 ms latency (+20 ms jitter), 2 % loss, 10 min of game time on the Push-Push online scene: no desync; V8 (Node, Chromium) and JavaScriptCore (WebKit; Bun locally) give the same checksums; two browsers play a live match through the relay · test: `packages/net/test/gate.spec.ts`, e2e: `e2e/net.spec.ts` (local Linux: WebKit skipped for missing system libraries, JavaScriptCore checked through Bun; CI installs WebKit)
- [x] Phase 3g Tooling · VS Code extension integration tests (@vscode/test-electron) for every TL-03 feature; hot reload keeps state · tests: `packages/vscode/test/integration/suite.ts` (12 tests, `pnpm --filter blacklight-vscode test:integration`, local Linux under Xvfb with VS Code 1.139), e2e `e2e/tooling.spec.ts`
- [ ] Phase 4 Docs & templates
- [ ] Phase 5 Release

## Runtime (RT)

- [x] RT-01 Loop · packages/core/src/loop.ts, game.ts · test: loop.spec.ts, e2e runtime.spec.ts
- [x] RT-02 Scenes · scene.ts, game.ts (goto + transitions, overlays, hostScene) · test: scene.spec.ts, e2e runtime.spec.ts "scenes host scenes…"
- [x] RT-03 Loading · scenes chunked by import.meta.glob (cli/src/vite.ts), `static assets` + scene assets/ preloaded, `game.loadingScreen`, `game.preload` · test: e2e runtime.spec.ts
- [x] RT-04 Registry · registry.ts, game.objectClass (local shadows global, suggestions) · test: systems.spec.ts, scene.spec.ts
- [ ] RT-05 Objects — partial · GameObject, Sprite/AnimatedSprite, Text (web + .fnt bitmap), Container, Graphics, Particles, TilemapLayer (+ Tiled import), Video done (objects/*) · test: scene.spec.ts, e2e "every object type"; Model3D arrives with phase 3b
- [ ] RT-06 Behaviors — partial · all 19 behaviors in behaviors/* · test: scene.spec.ts, behaviors.spec.ts (all 19 exercised); a docs page with a live example per behavior needs the phase 4 playground
- [x] RT-07 Animations · anim/animator.ts, schema/anim.schema.json · test: animator.spec.ts, e2e runtime.spec.ts (frame events)
- [x] RT-08 Sprite sheets · anim/sheets.ts, sheet-cache.ts, cli/src/atlas.ts · test: animator.spec.ts, cli project.spec.ts, e2e release build (atlas)
- [x] RT-09 Collisions · collision/* · test: collision.spec.ts, scene.spec.ts
- [x] RT-10 Physics · packages/physics (Rapier 2D) · test: physics.spec.ts
- [x] RT-11 Input · input/input.ts, bindings.ts (actions, rebinding saved in settings, last device, 8 players, join) · test: input.spec.ts, e2e runtime.spec.ts
- [ ] RT-12 Gamepads — partial · web/mobile: Gamepad API + SDL_GameControllerDB (input/gamepad.ts) · test: input.spec.ts; desktop SDL in Electron arrives with phase 3c
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
- [ ] UI-08 Transitions
- [ ] UI-09 Rich text
- [ ] UI-10 Dialogue
- [ ] UI-11 FX layer
- [x] UI-12 Themes · theme.ts (tokens → CSS variables, blacklight and persona, live switch saved in settings) · test: runtime.spec.ts, e2e ui.spec.ts (theme switch)
- [x] UI-13 Widgets · widgets/* (button, menu list, tabs, gauge with trail, counter, virtualized scroll list, inventory grid, slider, toggle, select, text input with IME + virtual keyboard, tooltip, toast, confirm dialog, radial menu) · test: widgets.spec.ts, e2e ui.spec.ts
- [ ] UI-14 World-anchored UI
- [ ] UI-15 Localization
- [ ] UI-16 Accessibility
- [ ] UI-17 Ready-made screens
- [ ] UI-18 Dev UI inspector
- [ ] UI-19 Video

## Modules (MOD)

- [x] MOD-01 defineModule · packages/core/src/modules (define.ts, host.ts, schema.ts), `modules` in config.ts, game.modules / game.destroy, cli/src/modules.ts (virtual module + Register types) · test: core modules.spec.ts, cli modules.spec.ts, e2e modules.spec.ts (tsc on game.modules)
- [x] MOD-02 Context · packages/core/src/modules (config, events, ModuleSaves hook, network + OfflineQueue, logger, storage, platform) · test: core modules.spec.ts, http.spec.ts, cloud-save.spec.ts, e2e modules.spec.ts (offline replay)
- [ ] MOD-03 Native part — partial · defineNative/fn in packages/native/src/define-native.ts (allowlist, argument schemas, inferred types via nativeModule) and the sqlite native part (better-sqlite3) · test: native/test/define-native.spec.ts, sqlite.spec.ts (through a simulated IPC); registration in the Electron main process (3c) and the Capacitor plugin side (3d) connect at merge (DECISIONS "define-native contract")
- [x] MOD-04 node_modules · packages/cli/src/modules.ts (Node built-ins and native addons refused in game code, module deps pre-bundled) · test: cli modules.spec.ts
- [x] MOD-05 Registry · packages/registry (manifest, validator, static API, index template with CI workflow), cli/src/commands/registry.ts (add, search, publish) · test: registry.spec.ts, cli registry.spec.ts, e2e modules.spec.ts
- [x] MOD-06 Official modules · packages/modules/{http,sqlite,cloud-save,accounts-oidc,achievements,telemetry}; physics in packages/physics; discord from 3c · test: http.spec.ts, sqlite.spec.ts, cloud-save.spec.ts, accounts.spec.ts, achievements.spec.ts, telemetry.spec.ts, e2e modules.spec.ts

## Platforms (PF)

- [ ] PF-01 Web/PWA
- [ ] PF-02 Electron
- [ ] PF-03 Builds
- [ ] PF-04 Capacitor Android and iOS — partial · packages/mobile, packages/cli/src/targets/mobile*.ts · test: mobile platform/plugin specs (packages/mobile/test), packages/cli/test/mobile.spec.ts, e2e/mobile-web.spec.ts, e2e/mobile-android.spec.ts (emulator, passes); iOS implemented (Xcode project generated and patched on Linux), Simulator run pending in CI
- [ ] PF-05 Steam
- [ ] PF-06 Everything works offline; online features fail gracefully…
- [ ] PF-07 Signing and notarization in the CLI, optional, enabled by…
- [ ] PF-08 Updates through stores only.
- [ ] PF-09 Templates ship a GitHub Actions workflow building every…

## Saves (SV)

- [ ] SV-01 `game.save`
- [ ] SV-02 Default location
- [ ] SV-03 AES-256-GCM with a random per-install key stored via…
- [ ] SV-04 Atomic writes (temp file + rename) and a backup of the…
- [ ] SV-05 Password-protected export/import to move saves between…
- [ ] SV-06 Cloud saves module (game server or Steam Cloud) with…
- [ ] SV-07 Dev builds write readable plain saves.

## Production hardening (SEC)

- [ ] SEC-01 DevTools, F12, Ctrl/Cmd+Shift+I, context menu and…
- [ ] SEC-02 Electron Fuses (no `--inspect`, no `ELECTRON_RUN_AS_NODE`…
- [ ] SEC-03 JS obfuscation with adjustable level.
- [ ] SEC-04 V8 bytecode compilation on desktop (L5).
- [ ] SEC-05 Protected in-memory values (masked copy + checksum) for…
- [ ] SEC-06 Debugger detection.
- [ ] SEC-07 WebView not inspectable in mobile release builds.
- [ ] SEC-08 Strict CSP, no `eval`.
- [ ] SEC-09 Tamper reaction
- [ ] SEC-10 Obfuscation + bytecode cost at most 10 % on the reference…

## Networking (NET)

- [x] NET-01 Relay server (Node, Docker image) · servers/relay (rooms, codes, lobby, WebSocket, `startRelay`, `relayNativeModule` for LAN), packages/net/src/relay-client.ts, lan.ts · test: servers/relay/test/relay.spec.ts, e2e/net.spec.ts (live match); Docker image checked by hand (MANUAL_TESTS)
- [x] NET-02 Rollback · packages/net/src/rollback.ts, scene-rollback.ts (prediction, rollback ≤ 8 steps, adjustable delay, RT-19 restore, checksums + desync report, 8 players, spectators incl. late join) · test: packages/net/test/rollback.spec.ts, scene-rollback.spec.ts, gate.spec.ts
- [x] NET-03 Determinism · packages/core/src/dmath.ts (`DMath`), packages/eslint-plugin (`blacklight/deterministic`) · test: packages/core/test/dmath.spec.ts (golden fingerprint), packages/eslint-plugin/test/deterministic.spec.ts, e2e/net.spec.ts (same bits on JavaScriptCore)
- [x] NET-04 Lockstep mode for turn-based games · packages/net/src/lockstep.ts · test: packages/net/test/lockstep.spec.ts
- [x] NET-05 Test harness · packages/net/src/testing.ts (`SimulatedNetwork`, `simulateMatch`, `headlessGame`) · test: packages/net/test/rollback.spec.ts, gate.spec.ts

## Platform services (SVC)

- [x] SVC-01 Accounts · packages/modules/accounts-oidc (PKCE S256, system browser, web redirect, custom-scheme deep link, refresh token in secure storage, BlackLight SSO preset, server linking) · test: accounts.spec.ts (desktop flow with simulated deep link), e2e modules.spec.ts (web flow against the mock provider); real SSO and devices in MANUAL_TESTS.md
- [x] SVC-02 Achievements · packages/modules/achievements (Steam, Game Center, Play Games through platform.invoke, reference server, offline queue) · test: achievements.spec.ts, e2e modules.spec.ts; real stores in MANUAL_TESTS.md
- [ ] SVC-03 Discord Rich Presence on desktop (presence, party…
- [x] SVC-04 Telemetry and crash reports · packages/modules/telemetry (opt-in, consent helper, Sentry envelopes, scrubbing, offline queue) · test: telemetry.spec.ts; real backend in MANUAL_TESTS.md
- [ ] SVC-05 Reference server — partial · servers/reference (cloud saves, achievements/leaderboards, OIDC account linking, Docker image checked) · test: servers/reference/test/*.spec.ts, cloud-save.spec.ts, achievements.spec.ts, e2e modules.spec.ts; the relay is servers/relay (3f), one compose file joins them at merge

## Tooling (TL)

- [ ] TL-01 CLI — partial · create, dev, build --target web, preview, types, doctor, lint, run (web + `runners` registry) in packages/cli · test: cli tools.spec.ts (doctor per target, lint rules, run web/runner/missing runner), project.spec.ts, vite.spec.ts; add/search/publish done by 3e (commands/registry.ts); build targets win/mac/linux/steam/android/ios + their runners (3c/3d) and sign (3c) come from those areas
- [x] TL-02 Hot reload · cli/src/tooling.ts (HMR code for scene/object modules), core/src/debug/hot.ts (scene rebuilt + snapshot restored, objects patched in place), Vue HMR via @vitejs/plugin-vue · test: core tooling.spec.ts, cli tools.spec.ts, e2e tooling.spec.ts "hot reload keeps the state of scenes, objects and screens"
- [x] TL-03 VS Code extension · packages/vscode (new scene/object, snippets + completion, sprite-sheet slicer, `.anim.json` editor + JSON Schemas, scene editor + `scene.load(layout)`, UI preview with focus states, UI timeline editor + `applyTimeline`, `game.config.ts` form, asset browser, debugging: launch config, Live Objects, debug channel) · test: vscode integration suite.ts (one test per feature), vscode unit core.spec.ts + webviews.spec.ts, core tooling.spec.ts, ui timeline-json.spec.ts, e2e tooling.spec.ts "the debug channel…"; Marketplace/Open VSX publishing is a dry run (`publish:dry-run`), real publish in MANUAL_TESTS.md

## Documentation and templates (DOC)

- [ ] DOC-01 VitePress site — partial · VitePress skeleton with BlackLight theme, getting started, layout, config, scenes, limitations (docs/)
- [ ] DOC-02 Live-editable examples on the page
- [ ] DOC-03 Docs examples are type-checked and run in CI; a broken…
- [ ] DOC-04 Playground
- [ ] DOC-05 Templates — partial · create-blacklight with `empty` and `persona-menu` (packages/create, templates/*); party-game, visual-novel, platformer, 2d-with-3d to do
- [ ] DOC-06 Each template runs with `blacklight dev` and builds for…
- [ ] DOC-07 Open source — partial · README, CONTRIBUTING, code of conduct, issue/PR templates, MIT license, THIRD_PARTY_LICENSES.md; changelog to do
- [ ] DOC-08 Deployment guides for the docs site, playground, registry…

## Non-functional (NF)

- [ ] NF-01 Stable 60 fps on a Samsung Galaxy A54 and an iPhone 12…
- [ ] NF-02 Cold start under 3 s on desktop; first interactive screen…
- [ ] NF-03 Under 300 MB memory on mobile for the party-game…
- [ ] NF-04 core size — measured 57 KB gzip without Pixi (dist/*.js, gamepad DB excluded: lazy chunk); to report in docs/benchmarks.md
- [ ] NF-05 Support
- [ ] NF-06 Fully typed, documented public API; semver from 1.0.
- [ ] NF-07 Tests — unit coverage of core 50 % (browser-only code is covered by e2e only); needs browser-mode unit tests to reach 80 %
