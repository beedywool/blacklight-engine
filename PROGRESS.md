# Progress

One line per `SPEC.md` requirement: `- [x] ID · where · test`. A requirement is checked only when its acceptance test passes in CI; partial work is noted on an unchecked line.

## Phase gates

- [x] Phase 0 Foundations · `pnpm create blacklight` → empty project runs in the browser · e2e: `e2e/create-empty.spec.ts` (passes locally on Linux; CI matrix configured in `.github/workflows/ci.yml`, not yet run: no remote)
- [x] Phase 1 Runtime · animated character (`.anim.json`) moved by a behavior, collides, plays audio; screenshot matches; release build packs atlases and strips debug · e2e: `e2e/runtime.spec.ts` (local Linux)
- [x] Phase 2 UI core · Persona-style pause menu (templates/persona-menu) fully navigable by a simulated gamepad; screenshots at 1920×1080 and phone; release build loads screens and Kenney glyphs · e2e: `e2e/ui.spec.ts` (local Linux)
- [ ] Phase 3a UI complete
- [ ] Phase 3b Light 3D
- [ ] Phase 3c Desktop
- [ ] Phase 3d Mobile
- [ ] Phase 3e Modules & services
- [ ] Phase 3f Networking
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

- [ ] 3D-01 `@blacklight/three`, loaded only by scenes that use it.
- [ ] 3D-02 Three.js shares Pixi's WebGL context; GL state is reset…
- [ ] 3D-03 `Model3D` is placed like a sprite
- [ ] 3D-04 Render-to-texture mode
- [ ] 3D-05 glTF/GLB loading (optional Draco and KTX2), skeletal…
- [ ] 3D-06 3D assets go through the same per-scene preload and work…
- [ ] 3D-07 Budget

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

- [ ] MOD-01 defineModule (config schema, typed game.modules, dispose)
- [ ] MOD-02 Context
- [ ] MOD-03 Native part
- [ ] MOD-04 node_modules
- [ ] MOD-05 Registry
- [ ] MOD-06 Official modules

## Platforms (PF)

- [ ] PF-01 Web/PWA
- [ ] PF-02 Electron
- [ ] PF-03 Builds
- [ ] PF-04 Capacitor Android and iOS
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

- [ ] NET-01 Relay server (Node, Docker image)
- [ ] NET-02 Rollback
- [ ] NET-03 Determinism
- [ ] NET-04 Lockstep mode for turn-based games.
- [ ] NET-05 Test harness

## Platform services (SVC)

- [ ] SVC-01 Accounts
- [ ] SVC-02 Achievements
- [ ] SVC-03 Discord Rich Presence on desktop (presence, party…
- [ ] SVC-04 Telemetry and crash reports
- [ ] SVC-05 Reference server (`servers/`, Docker)

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
