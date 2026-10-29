# Progress

One line per `SPEC.md` requirement: `- [x] ID · where · test`. A requirement is checked only when its acceptance test passes in CI; partial work is noted on an unchecked line.

## Phase gates

- [x] Phase 0 Foundations · `pnpm create blacklight` → empty project runs in the browser · e2e: `e2e/create-empty.spec.ts` (passes locally on Linux; CI matrix configured in `.github/workflows/ci.yml`, not yet run: no remote)
- [ ] Phase 1 Runtime
- [ ] Phase 2 UI core
- [ ] Phase 3a UI complete
- [ ] Phase 3b Light 3D
- [ ] Phase 3c Desktop
- [ ] Phase 3d Mobile
- [ ] Phase 3e Modules & services
- [ ] Phase 3f Networking
- [ ] Phase 3g Tooling
- [ ] Phase 4 Docs & templates
- [ ] Phase 5 Release

## Runtime (RT)

- [ ] RT-01 Loop — partial · fixed step, capped catch-up, interpolation factor, pause on blur done (packages/core/src/loop.ts, test: loop.spec.ts); configurable rate done
- [ ] RT-02 Scenes — partial · Scene create/update/render/destroy and goto done (packages/core/src/scene.ts, game.ts); transitions, overlay and hosted scenes to do
- [ ] RT-03 Loading — partial · one chunk per scene via import.meta.glob (packages/cli/src/vite.ts); asset preload, loading screen, preload(name) to do
- [ ] RT-04 Registry
- [ ] RT-05 Objects
- [ ] RT-06 Behaviors
- [ ] RT-07 Animations
- [ ] RT-08 Sprite sheets
- [ ] RT-09 Collisions
- [ ] RT-10 Physics
- [ ] RT-11 Input
- [ ] RT-12 Gamepads
- [ ] RT-13 Audio
- [ ] RT-14 Tweens
- [ ] RT-15 Events
- [ ] RT-16 Time and randomness
- [ ] RT-17 Camera
- [ ] RT-18 Resolution — partial · virtual resolution, extend/letterbox, pixel-art integer scale (packages/core/src/viewport.ts, test: viewport.spec.ts); safe areas to do
- [ ] RT-19 Serializable state
- [ ] RT-20 Debug

## Light 3D (3D)

- [ ] 3D-01 `@blacklight/three`, loaded only by scenes that use it.
- [ ] 3D-02 Three.js shares Pixi's WebGL context; GL state is reset…
- [ ] 3D-03 `Model3D` is placed like a sprite
- [ ] 3D-04 Render-to-texture mode
- [ ] 3D-05 glTF/GLB loading (optional Draco and KTX2), skeletal…
- [ ] 3D-06 3D assets go through the same per-scene preload and work…
- [ ] 3D-07 Budget

## UI (UI)

- [ ] UI-01 Vue 3 DOM layer above the canvas, scaled with the virtual…
- [ ] UI-02 Screen stack
- [ ] UI-03 Spatial focus
- [ ] UI-04 Input prompts
- [ ] UI-05 Layout
- [ ] UI-06 Shapes
- [ ] UI-07 Timelines
- [ ] UI-08 Transitions
- [ ] UI-09 Rich text
- [ ] UI-10 Dialogue
- [ ] UI-11 FX layer
- [ ] UI-12 Themes
- [ ] UI-13 Widgets
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

- [ ] TL-01 CLI `blacklight` — partial · create, dev, build --target web, preview (packages/cli); other targets, run, doctor, add/search/publish, lint, sign to do
- [ ] TL-02 Hot reload
- [ ] TL-03 VS Code extension (Marketplace + Open VSX), complete in…

## Documentation and templates (DOC)

- [ ] DOC-01 VitePress site — partial · VitePress skeleton with BlackLight theme, getting started, layout, config, scenes, limitations (docs/)
- [ ] DOC-02 Live-editable examples on the page
- [ ] DOC-03 Docs examples are type-checked and run in CI; a broken…
- [ ] DOC-04 Playground
- [ ] DOC-05 Templates via `create-blacklight` — partial · create-blacklight with the empty template (packages/create, test: scaffold.spec.ts, e2e: create-empty.spec.ts)
- [ ] DOC-06 Each template runs with `blacklight dev` and builds for…
- [ ] DOC-07 Open source — partial · README, CONTRIBUTING, code of conduct, issue/PR templates, MIT license, THIRD_PARTY_LICENSES.md; changelog to do
- [ ] DOC-08 Deployment guides for the docs site, playground, registry…

## Non-functional (NF)

- [ ] NF-01 Stable 60 fps on a Samsung Galaxy A54 and an iPhone 12…
- [ ] NF-02 Cold start under 3 s on desktop; first interactive screen…
- [ ] NF-03 Under 300 MB memory on mobile for the party-game…
- [ ] NF-04 `@blacklight/core` without Pixi, Vue and Three
- [ ] NF-05 Support
- [ ] NF-06 Fully typed, documented public API; semver from 1.0.
- [ ] NF-07 Tests
