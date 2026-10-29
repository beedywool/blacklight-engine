# CLAUDE.md — Blacklight Engine

You are building Blacklight Engine from scratch, alone, in one delivery. `SPEC.md` says **what** to build; this file says **how** to work. Read both fully before writing code.

## Mission

Deliver 1.0 as defined in `SPEC.md` §12, with every requirement implemented and verified. Work autonomously from start to finish: do not stop for approval between phases. A phase starts only when the previous phase's gate is green.

## Working rules

- **Never wait for the owner.** When something is unclear, pick the option that is simplest for a web developer using the engine, write one line in `DECISIONS.md` (`date · topic · choice · why`), continue.
- **Never mark a requirement done without a test.** `PROGRESS.md` has one line per requirement ID: `- [x] RT-07 · packages/core/src/anim · test: anim.spec.ts`.
- **Things you cannot verify** (physical gamepads, real phones, Steam client, real certificates, store accounts): implement them, cover what you can with emulators/mocks/dry-runs, and add exact manual steps to `MANUAL_TESTS.md`. Then move on.
- **Do not reduce scope.** There is no MVP. If something turns out impossible, implement the closest possible behavior, document it under "Accepted limitations" in the docs and in `DECISIONS.md`.
- **Do not reintroduce rejected choices**: no GSAP, no visual scripting, no `nodeIntegration`, no keys in source, no Fusion-style conventions (numeric directions, A–Z values, numbered animations), no auto-update/OTA, no monetization, no modding.
- Do not edit `SPEC.md`; progress lives in `PROGRESS.md`. If the spec is wrong, record it in `DECISIONS.md`.

## Stack and tooling

- Node: current LTS. Package manager: pnpm workspaces. Language: TypeScript `strict`, ESM only.
- Build: Vite (games, docs, UI), tsup or Vite library mode (packages). Electron packaging: electron-builder. Mobile: Capacitor (current major).
- Lint/format: ESLint (typescript-eslint) + Prettier. Custom ESLint plugin `eslint-plugin-blacklight` for determinism rules (NET-03) and Node-import detection (MOD-04).
- Tests: Vitest (unit), Playwright (screenshot, web e2e, Electron e2e via `_electron`), Android emulator, iOS Simulator on GitHub Actions macOS runners. Xvfb for headless Electron on Linux.
- Pin exact dependency versions; use the latest stable release at project start. Check every license against `SPEC.md` §9 before adding a dependency and record it in `THIRD_PARTY_LICENSES.md`.
- Candidate libraries (verify they are maintained; otherwise write a minimal implementation): PixiJS v8, Three.js, Vue 3, Motion, inkjs, @dimforge/rapier2d-compat, better-sqlite3, @capacitor-community/sqlite, sql.js, steamworks.js, an SDL2/SDL3 Node binding for gamepads (e.g. @kmamal/sdl), javascript-obfuscator, a V8 bytecode compiler for Electron, @electron/fuses, CodeMirror 6, VitePress, TypeDoc, Kenney input prompts (CC0).

## Code conventions

- English everywhere: identifiers, comments, docs, commit messages, error messages.
- Public API: classes and methods named by what a web developer expects (`play`, `spawn`, `goto`, `pressed`). Configuration through static properties and typed config objects. No magic strings without types: animation names, actions, scene names and asset paths are typed (generate `.d.ts` from the project at dev time).
- Every public symbol has TSDoc with a short example. Every error message says what went wrong and how to fix it.
- Comments explain why, not what. Keep functions small; no premature abstraction.
- No `any` in public types. No default exports in engine packages (games may use them).
- Security: renderer never gets Node; the IPC bridge exposes an allowlist; validate every argument crossing it.

## Order of work and gates

Phases 0–2 are sequential. After phase 2, run the remaining phases in parallel with sub-agents (one per phase), each owning its packages. Shared interfaces live in `@blacklight/core`; a sub-agent that needs a core change opens it as a separate, small commit and notifies the others through `DECISIONS.md`. Integrate continuously: the two reference templates must keep building.

| Phase | Content (SPEC IDs) | Gate (automated) |
|---|---|---|
| 0 Foundations | monorepo, CI on all OS, lint, test setup, docs skeleton, `create`/`dev` | `pnpm create blacklight` → empty project runs in the browser; CI green on Linux, Windows, macOS |
| 1 Runtime | RT-01…RT-20, web build | Playwright demo: animated character (anim.json) moved by a behavior, collides, plays audio; screenshot matches |
| 2 UI core | UI-01…UI-07, UI-12, UI-13 | Persona-style pause menu fully navigable by simulated gamepad input; screenshot tests |
| 3a UI complete | UI-08…UI-11, UI-14…UI-19 | Ink dialogue with choices, transitions, FX layer, CJK + RTL text, video cutscene |
| 3b Light 3D | 3D-01…3D-07 | glTF model between two 2D layers and inside a menu (RTT); fps budget met in the benchmark |
| 3c Desktop | PF-02, PF-03, PF-05, PF-07, SV-01…SV-07, SEC-01…SEC-10, RT-12 SDL, SVC-03 | Electron e2e on 3 OS; modified save rejected; devtools shortcut ignored in release; fuses verified; signing dry-run |
| 3d Mobile | PF-04, mobile plugins, secure storage, SQLite, achievements | Android emulator + iOS Simulator e2e: template launches offline, touch input, save round-trip |
| 3e Modules & services | MOD-01…MOD-06, SVC-01, SVC-02, SVC-04, SVC-05 | `blacklight add sqlite` in a fresh project; OIDC login against a mock provider; offline queue replays |
| 3f Networking | NET-01…NET-05 | 4 simulated players, 150 ms latency, 2 % loss: no desync over 10 min; V8 vs JavaScriptCore checksums equal |
| 3g Tooling | TL-01…TL-03 | VS Code extension integration tests (@vscode/test-electron) for every feature listed in TL-03 |
| 4 Docs & templates | DOC-01…DOC-08, PF-01, PF-09 | every docs example runs in CI; all six templates build for all targets; "Getting started" test passes |
| 5 Release | §11, §12 | full CI matrix green, benchmarks published, MANUAL_TESTS.md complete, `1.0.0` tagged |

## House style (owner's other projects)

The engine belongs to the BlackLight family. Sibling projects live next to this repository in `~/Documents/Projects/` and are the reference for tone and look; read them, do not copy their code blindly.

- **Docs writing** follows `../blacklight-sso/README.md` and `../numx-remake/README.md`: English, direct, second person sparingly, dense paragraphs that state what happens and why, exact commands in `sh` blocks, env vars / file paths in backticks, a "limits" section that says plainly what is not done. No marketing adjectives, no emoji, no "simply"/"just".
- **Docs look** follows `../blacklight-website` and `../blacklight-sso/client`: pure black surface (`#080808`), grey M3 Expressive containers, white links in bold, Google Sans Flex bundled locally (no font CDN; the sites ship a strict CSP), the hanging-bulb logo (`docs/public/logo_bulb_only.png`). The VitePress theme in `docs/.vitepress/theme` carries these tokens; examples and playground use the same palette.
- **Branding**: "BlackLight" for the organization and its services (BlackLight SSO), "Blacklight Engine" for this product, `blacklight` for package and CLI names.

## Reference template: party-game (from numx-remake)

`templates/party-game` is the NumX experience rebuilt the Blacklight way. `../numx-remake/client/src/scenes` documents the behavior (each file starts with a summary of the original frame); reuse the game design, never its Fusion conventions (`gv[n]` globals, `setVal('C')`, numeric directions, frame indexes).

- Flow: `title` → `player-select` (join screen, up to 8 local players, profile or guest, "Ready!") → `game-select` (mini-game cards with min/max players and two settings each) → `match` shell (player banners and scores, pause menu, the mini-game hosted as a sub-scene, replay/back at the end) → `results` (podium, points).
- Shared mini-game base: title banner slides in, controls locked until "Go!" zooms out, power card (shield 3 s), per-player skins.
- Mini-games (one scene each, scene-local objects): **Survival VS** (dodge bouncing enemies, three hits, 1 point per second survived), **Air Hockey** (two teams, first to 5/7/10 goals), **50-50** (pick a side before the doors open, the cloud hits one side), **Obstacles** (walls push players into the water, speed rises over time), **Hide and Seek** (hide behind blocks, the seeker throws three balls then guesses with pointer or gamepad crosshair), **Push-Push** (sumo: shove whoever is in front, ring-out).
- Online variants of each mini-game use `@blacklight/net` rollback (party-game is the NET gate's real-world test). Accounts use the OIDC module with the BlackLight SSO preset, like NumX.
- Art: original placeholder art made for the template (CC0), never NumX assets.

## Files you maintain

- `PROGRESS.md` — every requirement ID with status and covering test.
- `DECISIONS.md` — every choice the spec left open.
- `MANUAL_TESTS.md` — owner checklist (steps + expected result), grouped by device.
- `THIRD_PARTY_LICENSES.md` — every runtime dependency and asset pack with its license.
- `docs/benchmarks.md` — NF measurements per target.

## Definition of done

`SPEC.md` §12. When it is met, stop and write a final summary: what was delivered, what is in `MANUAL_TESTS.md`, and every accepted limitation.
