# Blacklight Engine — Specification

Status: final for 1.0. Implementer: Claude (Claude Code), working autonomously.

## 0. How to read this document

- Every requirement has an ID (`RT-01`, `UI-07`…). Code, tests, commits and `PROGRESS.md` reference these IDs.
- "MUST" is mandatory for 1.0. There is no MVP, no V1.1, no "later": **1.0 ships the whole scope of this document in one delivery.**
- A requirement is done only when its acceptance check passes in CI (or, for the items listed in §11.3, when it is added to `MANUAL_TESTS.md`).
- When this document is silent on a detail, choose the option that is simplest for a web developer using the engine, record the choice in `DECISIONS.md` with one line of reasoning, and continue. Do not stop to ask.
- `CLAUDE.md` holds the working rules (tooling, order of work, conventions). This file holds what to build.

## 1. Product

Blacklight Engine is an open-source (MIT) TypeScript game framework for web developers. Games are made of scenes and object-oriented game objects, with a very complete UI layer aimed at Persona-style menus, light 3D inside 2D scenes, optional rollback netcode, encrypted saves and a hardened production build. One project exports to web/PWA, Windows, macOS, Linux, Android, iOS and Steam, and runs fully offline.

### 1.1 Goals

- **G1** A web developer picks it up like a framework: classes, ES imports, CLI, hot reload, complete types, documentation with live-editable examples.
- **G2** UI on par with Persona 5 menus: stacked screens, bold transitions, skewed/masked shapes, precise timelines, flawless gamepad navigation.
- **G3** One project, one command per target, no code change between targets, playable without network.
- **G4** Saves cannot be read or edited with generic tools; casual cheating (console, save editing, memory scanners) is blocked.
- **G5** Public open-source project: docs, templates, module registry, contribution guide.

### 1.2 Reference games (used as continuous tests)

1. **Party game** in the spirit of NumX: several mini-games, up to 8 local players on one screen, up to 8 online players with rollback.
2. **Visual novel**: Ink-scripted story, dialogue UI, choices, saves, gallery, Persona-style menus.

Both are built as templates during development (§12) and exercise every subsystem.

### 1.3 Prior art

The author's previous project, numx-remake (an HTML/JS port of a Clickteam Fusion game), proved these patterns; reuse the ideas, not the Fusion conventions:
- one class per scene with lifecycle methods and named events;
- a fixed 60 Hz logic tick independent of the display rate;
- ready-made movements (8-direction, platform, ball, bullet, path);
- animation fallback when an animation or direction is missing;
- Electron serving the game through a privileged custom protocol (not `file://`) so `fetch()` works offline;
- a minimal `contextBridge` preload, no Node access in the page;
- a scene hosted inside another scene (sub-application).

Do **not** reproduce: directions as 0–31 integers, alterable values indexed A–Z, numbered animations, global asset JSON dumps, UI drawn as canvas sprites, encryption keys in source.

## 2. Scope

### 2.1 In scope

2D runtime (PixiJS v8), light 3D (Three.js), Vue 3 UI layer, module system and registry, optional rollback networking with a relay server, saves, production hardening, platform adapters (web, Electron, Capacitor, Steam), player accounts (OIDC), achievements, Discord Rich Presence, opt-in telemetry, CLI, VS Code extension, documentation site with live examples, templates.

### 2.2 Out of scope

- A standalone visual editor (all visual tooling lives in the VS Code extension).
- Visual scripting / event sheets / node graphs. Game logic is code only.
- A full 3D engine: 3D is a complement inside 2D scenes.
- Auto-update and over-the-air bundle updates: updates go through stores only.
- Monetization (in-app purchases, ads).
- Player modding.
- Direct connections from the game client to remote databases.
- Hosting: the owner hosts the docs, sandbox, registry index and servers. The engine ships them as deployable artifacts with instructions.

## 3. Fixed decisions

| Area | Decision |
|---|---|
| Language | TypeScript, strict, mandatory for the engine **and** for games. Code, API, comments, docs: English only. |
| Renderer | PixiJS v8 (WebGL, WebGPU when available). |
| Light 3D | Three.js sharing Pixi's WebGL context, plus render-to-texture. |
| Game loop | Fixed 60 Hz logic step, interpolated rendering at display rate. |
| Object model | OOP classes (`class Player extends Sprite`) + attachable behaviors. |
| Scene lookup | Explicit ES imports **and** a name registry; scene-local objects shadow global ones. |
| Scene loading | One lazy chunk per scene, declared assets preloaded before `create()`. |
| Resolution | Always a virtual resolution; each game chooses `extend` (safe-area anchored, background overflows) or `letterbox` in its config. |
| Sprite sheets | Aseprite JSON (with tags and slices) and grid-by-filename (`hero@64x64.png`). |
| Animations | Separate `<object>.anim.json` file per object, with a published JSON Schema. |
| Physics | Collisions and movements in core; rigid-body physics as an optional Rapier module. |
| Controls | As many ready-made behaviors as possible (§7.1 RT-06). |
| Gamepads | SDL in the Electron main process on desktop; Gamepad API normalized with SDL_GameControllerDB on web and mobile; one API for games. |
| UI technology | Hybrid: Vue 3 DOM layer over the canvas + a WebGL effects layer; a component can be rendered inside Pixi when it must itself go through a shader. |
| UI animation | Motion (MIT). GSAP is not used. |
| Dialogue scripts | Ink (inkjs runtime). |
| Tilemaps | Engine-native tilemaps (code/JSON, editable in the VS Code scene editor). Tiled import is optional and never required. |
| Modules | `defineModule` (runs everywhere) + optional native part (Electron main / Capacitor plugin) behind one interface. |
| npm | Browser packages bundled by Vite; Node-only packages allowed only in native parts. |
| Module sharing | Dedicated registry + CLI (`blacklight add`). |
| Databases | Remote data through HTTP APIs only; local SQLite on all platforms. |
| Networking | Optional package: relay server, rooms, LAN hosting, rollback, deterministic math. Up to 8 players per room. |
| Local players | Up to 8 on one device. |
| Targets | Web/PWA, Windows, macOS (x64 + arm64), Linux, Android, iOS, Steam. |
| Offline | Everything embedded; online features are a bonus that queues and resyncs. |
| Updates | Stores only. |
| Signing | Supported by the CLI, optional, enabled when certificates are present. No accounts exist during development: signing and store upload are verified in dry-run mode only. |
| Saves | OS-standard location, overridable; AES-256-GCM with a per-install key in the OS keystore + HMAC; optional cloud saves module. |
| Hardening | All eight measures of §7.7, configurable, on by default in release builds. Tamper reaction: `game.on('tamper')` hook, default restore + log. |
| Accounts | Generic OIDC module with a BlackLight SSO preset. |
| Platform services | Achievements (Steam, Game Center, Play Games), Discord Rich Presence, opt-in telemetry and crash reports. |
| Text | Latin, CJK (with IME input) and RTL scripts. |
| Video | MP4 H.264 everywhere, WebM VP9 (with alpha) on desktop and Android. |
| Gamepad glyphs | Kenney CC0 input prompts, replaceable per game. Never ship official console artwork. |
| Docs language | English only. |
| License | MIT, from the first commit. |

## 4. Accepted limitations

These are known and accepted. Document each in the relevant docs page; do not try to remove them.

- **L1 Shaders cannot read DOM pixels.** Effects live on a WebGL layer above/below the UI, or the component is rendered in Pixi (`<PixiRender>` wrapper, §7.3 UI-11).
- **L2 Floating-point divergence between V8 and JavaScriptCore (iOS).** Online games MUST use the engine's deterministic math in simulation code; a lint rule enforces it (§7.8 NET-03).
- **L3 Steam overlay with Electron.** Try the known workarounds; if the overlay still fails, ship without it. Achievements, Cloud and rich presence MUST work.
- **L4 Client-side protection is a deterrent, not a guarantee.** Anything that must be fair between players is validated by a server.
- **L5 V8 bytecode** is tied to the Electron/V8 version and is rebuilt with each Electron upgrade; release stack traces need private source maps.
- **L6 No store accounts during development**: signing, notarization and store uploads are implemented and tested in dry-run mode.
- **L7 Physical-device checks** (real gamepads, real iPhone/Android, Steam client) cannot be automated; they go to `MANUAL_TESTS.md` (§11.3).

## 5. Deliverables

A pnpm monorepo:

```
blacklight-engine/
├── packages/
│   ├── core/            @blacklight/core      runtime
│   ├── three/           @blacklight/three     light 3D
│   ├── ui/              @blacklight/ui        Vue 3 UI layer, transitions, FX layer
│   ├── native/          @blacklight/native    Electron main, preload, IPC bridge, SDL, Steamworks, Discord
│   ├── mobile/          @blacklight/mobile    Capacitor plugins (secure storage, SQLite, haptics, lifecycle, achievements)
│   ├── net/             @blacklight/net       client (rooms, rollback) + relay server (Docker image)
│   ├── physics/         @blacklight/physics   Rapier module
│   ├── modules/         official modules: http, sqlite, cloud-save, accounts-oidc, achievements, discord, telemetry
│   ├── cli/             @blacklight/cli       `blacklight` command
│   ├── create/          create-blacklight     project scaffolder
│   ├── vscode/          blacklight-vscode     VS Code extension
│   └── registry/        registry index format, validator, static API generator
├── templates/           empty, party-game, visual-novel, persona-menu, platformer, 2d-with-3d
├── docs/                VitePress site, live examples, playground
├── servers/             relay + cloud-save + achievements/leaderboard reference server (Docker)
├── SPEC.md  CLAUDE.md  PROGRESS.md  DECISIONS.md  MANUAL_TESTS.md
└── LICENSE (MIT)  THIRD_PARTY_LICENSES.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md
```

Before publishing anything, check that the `@blacklight` npm scope and the package names are free; if not, pick another scope and record it in `DECISIONS.md`.

## 6. Game project

### 6.1 Layout

```
my-game/
├── game.config.ts
├── scenes/<name>/<name>.scene.ts      + objects/ ui/ assets/ (scene-local)
├── objects/<name>/<name>.object.ts    + sprite or sheet + <name>.anim.json
├── models/                            glTF / GLB
├── ui/                                global screens, components, themes
├── animations/                        shared timelines
├── stories/                           Ink files
├── modules/                           game-local modules
├── locales/<lang>.json
└── assets/                            fonts, audio, video, shared images
```

Aliases: `@objects`, `@ui`, `@modules`, `@assets`, `@models`, `@stories`.

### 6.2 Config

`game.config.ts` exports `defineConfig({...})`, fully typed and validated at build time with readable errors. It covers: `name`, `id` (reverse domain), `version`, `entry` scene, `resolution { width, height, mode: 'extend' | 'letterbox', pixelArt }`, `input` action map, `save { location per platform, slots, autosave, encryption, integrity }`, `security` (each §7.7 measure + `protect` list + `onTamper`), `targets`, `modules` with their config, `locales`, `telemetry`, `accounts`, `steam { appId }`, `discord { appId }`, `mobile { orientation, statusBar }`, `window { fullscreen, resizable, minSize }`.

### 6.3 API shape (normative example)

```ts
// scenes/battle/battle.scene.ts
import { Scene } from '@blacklight/core';
import Player from '@objects/player';
import Shadow from './objects/shadow';
import BattleHUD from './ui/BattleHUD.vue';

export default class Battle extends Scene<{ enemy?: Shadow }> {
  static assets = ['./assets/arena.png', '@assets/music/battle.ogg'];
  player!: Player;

  create({ enemy }) {
    this.player = this.spawn(Player, { x: 320, y: 540 });
    this.ui.open(BattleHUD, { party: this.game.save.data.party });
    this.audio.music('battle', { fade: 800 });
  }
  update() {
    if (this.input.pressed('pause')) this.ui.push('PauseMenu');
  }
}
```

```ts
// objects/player/player.object.ts  (+ player.anim.json, player.aseprite.json)
import { Sprite, behaviors } from '@blacklight/core';
import anims from './player.anim.json';

export default class Player extends Sprite {
  static animations = anims;
  static behaviors = [behaviors.eightDirections({ speed: 240 })];
  hp = 100;
  update() { this.play(this.velocity.length > 0 ? 'run' : 'idle'); }
  onCollide(other) { if (other.is('Shadow')) this.scene.goto('battle', { enemy: other }); }
}
```

The final API may differ in details; it MUST keep this level of simplicity.

## 7. Functional requirements

### 7.1 Runtime (RT)

- **RT-01 Loop**: fixed step (default 60 Hz, configurable), accumulator, capped catch-up, interpolated render, optional auto-pause on focus loss.
- **RT-02 Scenes**: `Scene` with `create(params)`, `update()` (fixed step), `render(alpha)` (optional), `destroy()`; `goto(name, params, { transition })`; overlay scenes; a scene hosted inside another scene with its own viewport.
- **RT-03 Loading**: one dynamic-import chunk per scene; `static assets` preloaded; customizable loading screen; explicit `preload(name)`.
- **RT-04 Registry**: `spawn(Class | 'Name', props)`; local shadows global; unknown names throw an error that suggests close names.
- **RT-05 Objects**: `GameObject`, `Sprite`, `AnimatedSprite`, `Text` (web fonts and bitmap fonts), `Container`, `Graphics`, `Particles`, `TilemapLayer` (engine-native tilemaps: tile layers, per-tile collision, animated tiles, defined in code or JSON; optional Tiled JSON import), `Video`, `Model3D` (§7.2). Parent/child hierarchy, layers, z-order, visibility, alpha, tint, Pixi filters.
- **RT-06 Behaviors**: `Behavior` interface (`attach`, `update`, `detach`, typed options), several per object, toggleable. Ship at least: eight-directions, four-directions, platformer (jump, coyote time, jump buffer, slopes, one-way platforms, moving platforms), grid movement with A* pathfinding, pointer (click, drag, hover), virtual joystick, path follow, patrol, follow target, bullet, bounce, tank rotation, sine wave, anchor to screen, wrap around screen, destroy outside layout, flash, fade, drag-and-drop with snap. Each behavior has a docs page with a live example.
- **RT-07 Animations**: `<object>.anim.json` with a published JSON Schema (wired to VS Code). It points at the frame source (Aseprite tags or grid) and describes each animation: frames, fps, loop, ping-pong, `next`, frame events, per-frame hitbox/pivot overrides. API: `play`, `queue`, `onFrame`, `onEnd`; fallback to a close animation when one is missing.
- **RT-08 Sprite sheets**: Aseprite JSON (hash and array, `frameTags`, `slices` for pivot and hitbox); grid by filename (`hero@64x64.png`, margin/spacing `hero@64x64+2.png`); loose images packed into atlases at build (max 4096²); pixel-art mode (nearest filtering, integer positions).
- **RT-09 Collisions**: box, circle, polygon, optional pixel mask; spatial hash broadphase; collision layers/masks; `onCollide`, `onCollideEnd`, `onLeave`; raycast.
- **RT-10 Physics**: `@blacklight/physics` (Rapier 2D), optional; core has no rigid bodies.
- **RT-11 Input**: action map in config (keyboard, mouse, touch, gamepad); `pressed`, `held`, `released`, `axis`; runtime rebinding saved with settings; last-used device detection; up to 8 local players with player↔device assignment and a join screen helper.
- **RT-12 Gamepads**: desktop: SDL binding in the Electron main process (hot-plug, rumble, gyro, LED, up-to-date SDL_GameControllerDB), events forwarded over the IPC bridge; web/mobile: Gamepad API normalized with SDL_GameControllerDB. Same API everywhere.
- **RT-13 Audio**: Web Audio; buses (music, sfx, voice, ui) with volumes; fades, crossfades, loop points, simple 2D positional sound; unlock on first gesture; ogg + m4a fallback for iOS.
- **RT-14 Tweens**: Motion driven by the engine clock (pauses with the game, respects time scale) for game objects and UI.
- **RT-15 Events**: typed global and scene buses; listeners auto-removed when their scene or object is destroyed.
- **RT-16 Time and randomness**: seeded deterministic RNG, game time vs real time, scene-bound `after` / `every` timers.
- **RT-17 Camera**: follow, bounds, shake, zoom; multiple cameras and split screen (up to 4 views).
- **RT-18 Resolution**: virtual resolution; `extend` or `letterbox` per game; safe areas exposed; device pixel ratio handled.
- **RT-19 Serializable state**: snapshot/restore of a whole scene; used by rollback and saves.
- **RT-20 Debug**: dev-only overlay (fps, hitboxes, object list, step-by-step, slow motion); stripped from release builds.

### 7.2 Light 3D (3D)

- **3D-01** `@blacklight/three`, loaded only by scenes that use it.
- **3D-02** Three.js shares Pixi's WebGL context; GL state is reset between both renderers.
- **3D-03** `Model3D` is placed like a sprite: 2D position, layer, z-order between 2D layers.
- **3D-04** Render-to-texture mode: the model is displayed as a sprite (2D filters, masks, usable inside UI, e.g. a rotating character in a menu).
- **3D-05** glTF/GLB loading (optional Draco and KTX2), skeletal animations driven with the same `play('walk')` API, simple lights, orthographic or perspective camera per 3D layer.
- **3D-06** 3D assets go through the same per-scene preload and work offline.
- **3D-07** Budget: a 2D scene with two animated 10k-triangle models stays at 60 fps on the reference devices (§8).

### 7.3 UI (UI)

- **UI-01** Vue 3 DOM layer above the canvas, scaled with the virtual resolution; UI coordinates are virtual pixels.
- **UI-02** Screen stack: `open`, `push`, `pop`, `replace`, modals; scene and global screens; enter/leave transitions; a modal blocks game input.
- **UI-03** Spatial focus: 4/8-direction navigation, groups, wrap, last-focus memory, focus trap in modals, focus sounds; mouse and touch stay in sync with focus.
- **UI-04** Input prompts: `<InputPrompt action>` with Xbox, PlayStation, Switch, keyboard and touch packs (Kenney CC0 by default, replaceable); follows the last-used device and rebinding.
- **UI-05** Layout: 9-point anchors, safe areas, player-adjustable UI scale.
- **UI-06** Shapes: `Skew`, `Slant`, `Mask` (animatable clip-path), 9-slice, outlines, offset drop shadows in the Persona style.
- **UI-07** Timelines: `useTimeline` (Motion), labels, audio sync, clean interruption.
- **UI-08** Transitions: extensible library (wipe, shatter, ink, zoom, slices, iris) usable between screens and between scenes.
- **UI-09** Rich text: color, shake, wave, size, icon, input glyph, speed, pause tags; per-character animation.
- **UI-10** Dialogue: box, skippable typewriter, name plate, portraits and expressions, choices, variables and conditions, backlog, auto and skip modes, voice lines, save mid-dialogue. Scripts are Ink (inkjs); Ink tags drive portraits, sounds, transitions and rich text; Ink state is part of saves.
- **UI-11** FX layer: a Pixi layer synchronized with DOM screens (glitch, halftone, blur, chromatic aberration, transition distortion). `<PixiRender>` renders a component inside Pixi when it must go through a shader (L1).
- **UI-12** Themes: CSS tokens (colors, fonts, UI sounds), several themes, hot switch.
- **UI-13** Widgets: button, menu list, tabs, animated gauges with trail, animated counters, virtualized scroll list, inventory grid, slider, toggle, select, text input (with IME composition and a gamepad virtual keyboard), tooltip, toast, confirm dialog, radial menu.
- **UI-14** World-anchored UI: follows a game object, hidden off-screen; floating damage numbers.
- **UI-15** Localization: one file per language, plurals (`Intl`), interpolation, hot switch; CJK (font subsetting at build, `Intl.Segmenter` line breaking, IME) and RTL.
- **UI-16** Accessibility: text size, contrast, color-blind filters, reduced motion, subtitles, text speed.
- **UI-17** Ready-made screens: settings (audio, video, controls with rebinding, language, accessibility), pause menu, save/load slots.
- **UI-18** Dev UI inspector: hovered component, state, focus.
- **UI-19** Video: background videos and cutscenes (MP4 H.264 everywhere, WebM VP9 with alpha on desktop/Android), skippable, subtitles.

### 7.4 Modules (MOD)

- **MOD-01** `defineModule({ name, version, platforms, config, dependencies, setup })`: config validated by a schema; the object returned by `setup` is exposed as `game.modules.<name>` with types; `dispose` on shutdown.
- **MOD-02** Context: config, events, saves, network (online state, offline queue with retry), logger, current platform.
- **MOD-03** Native part: `defineNative` runs in the Electron main process; a Capacitor plugin with the same interface on mobile; only exposed functions cross the IPC bridge; arguments validated; types generated.
- **MOD-04** node_modules: browser packages bundled by Vite; Node packages only in native parts; the build fails with a clear message when game code imports a Node module.
- **MOD-05** Registry: `blacklight add | search | publish`; the registry indexes npm packages (`blacklight-module-*`) with a manifest (engine compatibility, platforms, permissions); the index is a static, self-hostable set of JSON files generated from a Git repository validated by CI. No tarball hosting.
- **MOD-06** Official modules: `http` (offline queue), `sqlite` (better-sqlite3 desktop, Capacitor SQLite mobile, sql.js + OPFS web), `cloud-save`, `accounts-oidc`, `achievements`, `discord`, `telemetry`, `physics`.

### 7.5 Platforms (PF)

- **PF-01** Web/PWA: service worker, full offline cache, installable.
- **PF-02** Electron: game served by a privileged custom protocol; `contextIsolation`, `sandbox`, no `nodeIntegration`; minimal typed preload; fullscreen and windowed with aspect ratio kept; quit.
- **PF-03** Builds: Windows (NSIS installer + portable), macOS (x64 + arm64, dmg + zip), Linux (AppImage + deb).
- **PF-04** Capacitor Android and iOS: embedded assets, configurable orientation, safe areas, haptics, Android back button mapped to the `back` action, pause/resume, keep screen awake.
- **PF-05** Steam: Steamworks via steamworks.js (achievements, Cloud, rich presence, overlay per L3); depot upload script (dry-run, L6).
- **PF-06** Everything works offline; online features fail gracefully and resync.
- **PF-07** Signing and notarization in the CLI, optional, enabled by present certificates; dry-run mode verified in CI.
- **PF-08** Updates through stores only.
- **PF-09** Templates ship a GitHub Actions workflow building every target (macOS runner for macOS and iOS).

### 7.6 Saves (SV)

- **SV-01** `game.save`: slots, autosave, metadata (date, play time, thumbnail), list/load/delete, versioned format migrations.
- **SV-02** Default location: OS standard (`%APPDATA%`, `~/Library/Application Support`, `$XDG_DATA_HOME`, app-private storage on mobile, IndexedDB on web), overridable in config.
- **SV-03** AES-256-GCM with a random per-install key stored via Electron `safeStorage`, iOS Keychain, Android Keystore; on web a non-extractable WebCrypto key. GCM tag + HMAC detect any modification.
- **SV-04** Atomic writes (temp file + rename) and a backup of the previous version; a corrupted save offers the backup.
- **SV-05** Password-protected export/import to move saves between devices.
- **SV-06** Cloud saves module (game server or Steam Cloud) with conflict resolution (newest / player choice).
- **SV-07** Dev builds write readable plain saves.

### 7.7 Production hardening (SEC)

Each measure is a config switch, off in dev, on by default in release:
- **SEC-01** DevTools, F12, Ctrl/Cmd+Shift+I, context menu and `--devtools` blocked.
- **SEC-02** Electron Fuses (no `--inspect`, no `ELECTRON_RUN_AS_NODE`, cookie encryption) and ASAR integrity.
- **SEC-03** JS obfuscation with adjustable level.
- **SEC-04** V8 bytecode compilation on desktop (L5).
- **SEC-05** Protected in-memory values (masked copy + checksum) for the paths listed in `security.protect`.
- **SEC-06** Debugger detection.
- **SEC-07** WebView not inspectable in mobile release builds.
- **SEC-08** Strict CSP, no `eval`.
- **SEC-09** Tamper reaction: `game.on('tamper', fn)`; without a handler, restore the value and log.
- **SEC-10** Obfuscation + bytecode cost at most 10 % on the reference benchmark; otherwise lower the default level.

### 7.8 Networking (NET) — optional package

- **NET-01** Relay server (Node, Docker image): rooms, room codes, lobby, LAN hosting from the desktop app, WebSocket transport.
- **NET-02** Rollback: input-only exchange, prediction, rollback up to 8 frames, adjustable input delay, state restore via RT-19, periodic checksums and desync detection with a diff report, up to 8 players, spectators.
- **NET-03** Determinism: seeded RNG and deterministic math (`sin`, `cos`, `atan2`, `sqrt`, `pow`…) provided by the engine; a lint rule forbids `Math.random`, `Math.sin` etc. and `Date.now` inside simulation code.
- **NET-04** Lockstep mode for turn-based games.
- **NET-05** Test harness: several local instances with simulated latency, jitter and packet loss.

### 7.9 Platform services (SVC)

- **SVC-01** Accounts: generic OIDC (authorization code + PKCE) through the system browser, deep link back (custom scheme on desktop and mobile, redirect on web), refresh token in secure storage; BlackLight SSO preset.
- **SVC-02** Achievements: one API backed by Steam, Game Center, Google Play Games, or the reference server; offline unlocks queued.
- **SVC-03** Discord Rich Presence on desktop (presence, party, join/ask-to-join).
- **SVC-04** Telemetry and crash reports: opt-in only, consent screen helper, Sentry-protocol compatible (works with self-hosted backends), DSN in config, no personal data by default.
- **SVC-05** Reference server (`servers/`, Docker): relay, cloud saves, achievements/leaderboards, account linking via OIDC. The owner hosts it.

### 7.10 Tooling (TL)

- **TL-01** CLI `blacklight`: `create`, `dev`, `build --target <web|win|mac|linux|android|ios|steam>`, `run --target` (device or emulator), `doctor` (SDKs, certificates), `add` / `search` / `publish`, `lint`, `sign --dry-run`.
- **TL-02** Hot reload: scenes and objects reload keeping state when possible; Vue HMR for UI.
- **TL-03** VS Code extension (Marketplace + Open VSX), complete in 1.0: new scene/object commands, snippets and completion (static props, animation names, input actions, asset paths), sprite-sheet slicer and preview, `.anim.json` editor with live preview, visual scene editor (placement saved as JSON), live UI component preview with simulated focus states, UI timeline editor, `game.config.ts` form, asset browser (thumbnails, unused assets, weight per scene), debugging of the running game (breakpoints, live object list, variables). Everything it edits stays readable TS/JSON.

### 7.11 Documentation and templates (DOC)

- **DOC-01** VitePress site: getting started, concepts, one guide per subsystem, recipes, API reference generated from types (TypeDoc), FAQ, migration guide.
- **DOC-02** Live-editable examples on the page: an editor (CodeMirror 6) next to a running preview of the engine; every edit re-runs the preview. Every concept, behavior, widget and transition has at least one.
- **DOC-03** Docs examples are type-checked and run in CI; a broken example blocks release.
- **DOC-04** Playground: a full mini-project editable in the browser, shareable by URL.
- **DOC-05** Templates via `create-blacklight`: empty, party-game, visual-novel, persona-menu, platformer, 2d-with-3d.
- **DOC-06** Each template runs with `blacklight dev` and builds for every target without changes.
- **DOC-07** Open source: README, CONTRIBUTING, code of conduct, issue/PR templates, semver, generated changelog, MIT license, `THIRD_PARTY_LICENSES.md`.
- **DOC-08** Deployment guides for the docs site, playground, registry index and reference server (the owner hosts them).

## 8. Non-functional requirements (NF)

- **NF-01** Stable 60 fps on a Samsung Galaxy A54 and an iPhone 12 with 300 animated sprites and an animated UI screen (measured with the benchmark scene in CI emulators + manual check).
- **NF-02** Cold start under 3 s on desktop; first interactive screen under 5 s on mobile.
- **NF-03** Under 300 MB memory on mobile for the party-game template.
- **NF-04** `@blacklight/core` without Pixi, Vue and Three: under 150 KB gzip.
- **NF-05** Support: Windows 10+, macOS 12+, Ubuntu 22.04+, Android 8+ (API 26), iOS 15+, last two versions of Chrome, Firefox, Safari.
- **NF-06** Fully typed, documented public API; semver from 1.0.
- **NF-07** Tests: unit coverage ≥ 80 % on `core` and `net`; screenshot tests for rendering and UI; one end-to-end test per target in CI.

## 9. Licensing

All dependencies MUST be MIT-compatible (MIT, BSD, Apache-2.0, ISC, zlib, CC0 for assets). Notable: PixiJS (MIT), Vue (MIT), Three.js (MIT), Motion (MIT), inkjs (MIT), Rapier (Apache-2.0), SDL (zlib), steamworks.js (MIT, Steamworks SDK under Valve's terms, optional module), Kenney input prompts (CC0). List every runtime dependency in `THIRD_PARTY_LICENSES.md`.

## 10. Risks

- Three.js + Pixi shared context: prototype first in the 3D phase.
- Steam overlay (L3): prototype early in the desktop phase.
- Rollback determinism across engines (L2): the cross-platform determinism test (§11.1) runs on V8 and on JavaScriptCore (macOS runner).
- Scope: the delivery is large; the two reference templates are built progressively to catch integration problems early.

## 11. Verification

### 11.1 Automated (CI must be green)

- Unit tests (Vitest) for every package.
- Screenshot tests (Playwright) for rendering, UI widgets, transitions, at 1920×1080 and a phone viewport.
- E2E: web (Playwright), Electron (Playwright `_electron`, Xvfb on Linux), Android (emulator), iOS and macOS (GitHub Actions macOS runner, iOS Simulator).
- Determinism: the same rollback session replayed on Node (V8) and Safari/JavaScriptCore produces identical checksums.
- Security: a test asserts each SEC measure in a release build (devtools shortcut ignored, fuse flags set, CSP present, modified save rejected…).
- Docs: all examples type-check and run.
- Performance: benchmark scene reports fps/memory; CI fails on regression > 10 %.

### 11.2 Phase demos

Each phase in `CLAUDE.md` ends with an automated demo (a Playwright script or test) that proves its acceptance criterion.

### 11.3 Manual checklist

`MANUAL_TESTS.md` lists, with exact steps and expected results, everything that cannot be automated: real gamepads (Xbox, PlayStation, Switch Pro, generic) on each desktop OS, rumble and gyro, real Android and iPhone devices, NF-01 on the reference phones, Steam client features and overlay, Discord presence, store signing with real certificates. The owner runs it after delivery.

## 12. Definition of done (1.0)

- Every requirement ID is implemented and checked in `PROGRESS.md` with the test that covers it.
- CI is green on all targets.
- The party-game and visual-novel templates build for web, Windows, macOS, Linux, Android, iOS and Steam without code changes, and run offline (except online play).
- A modified save is rejected and the backup offered; release builds expose no console by shortcut, argument or WebView inspection.
- A developer new to the engine can follow "Getting started" to a controllable animated character and a menu in under one hour (the guide is written and tested as a single runnable example).
- `MANUAL_TESTS.md`, `DECISIONS.md`, `THIRD_PARTY_LICENSES.md` and deployment guides are complete.
- NF measurements are reported in `docs/benchmarks.md`.

## 13. Still to fill in by the owner

- Repository location: `~/Documents/Projects/blacklight-engine` (local). GitHub organization: not decided yet.
- Start date: 2026-10-29.
