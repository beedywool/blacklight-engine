# Contributing

Blacklight Engine is a pnpm monorepo. `SPEC.md` says what the engine must do, `PROGRESS.md` what is done, `DECISIONS.md` why things are the way they are.

## Setup

Requires Node.js 24+ and [pnpm](https://pnpm.io/installation) 12+. Install the dependencies (`pnpm install`) before running anything.

```sh
pnpm install
pnpm build          # every package in packages/
pnpm test           # unit tests (Vitest)
pnpm lint           # ESLint + Prettier check
pnpm typecheck
pnpm e2e            # browser tests (Playwright; first run: pnpm exec playwright install chromium)
pnpm e2e --update-snapshots   # after an intended visual change, then review the new images
pnpm docs:dev       # documentation on http://localhost:5173
```

To try a change in a real game, scaffold one against your checkout:

```sh
node packages/create/dist/index.js ../my-game --link "$PWD"
cd ../my-game && pnpm install && pnpm dev
```

`--link` writes `link:` dependencies to `packages/*`; rebuild the package you changed (`pnpm --filter @blacklight/core build`, or `dev` for watch mode) and the game picks it up.

## Layout

| Folder                             | Content                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`                    | `@blacklight/core`: the runtime                                                                                                        |
| `packages/ui`                      | `@blacklight/ui`: Vue UI layer (`prompts/` holds Kenney's CC0 glyphs; `node scripts/prompt-urls.mjs` regenerates `src/prompt-urls.js`) |
| `packages/three`, `physics`, `net` | optional runtime packages: 3D, rigid bodies, online play                                                                               |
| `packages/native`, `mobile`        | desktop (Electron) and mobile (Capacitor) platforms                                                                                    |
| `packages/modules/*`, `registry`   | official modules and the module registry                                                                                               |
| `packages/eslint-plugin`           | `eslint-plugin-blacklight` (deterministic simulation code)                                                                             |
| `packages/cli`                     | `@blacklight/cli`: the `blacklight` command, its Vite configuration, build targets and runners                                         |
| `packages/create`                  | `create-blacklight`: the project scaffolder                                                                                            |
| `packages/vscode`                  | VS Code extension (`pnpm --filter blacklight-vscode test:integration` runs its integration tests under Xvfb)                           |
| `servers/`                         | relay and reference server (Docker)                                                                                                    |
| `templates/`                       | project templates, copied by `create-blacklight`                                                                                       |
| `docs/`                            | VitePress documentation site                                                                                                           |
| `e2e/`                             | Playwright tests, including the phase gates; `e2e/fixtures/` holds test games (generators for their art and media sit next to them)    |

## Rules

- TypeScript strict, ESM only, English everywhere (code, comments, docs, commits, error messages).
- Named exports in engine packages; games may use default exports.
- Every public symbol has TSDoc with a short example. Every error says what went wrong and how to fix it.
- A pull request that changes behaviour adds or updates a test, and updates `PROGRESS.md` with the requirement ID it covers.
- Dependencies are pinned to exact versions and must be MIT-compatible (MIT, BSD, Apache-2.0, ISC, zlib, CC0); add runtime ones to `THIRD_PARTY_LICENSES.md`.
- Commit messages: `area: what changed` in the imperative (`core: cap catch-up steps after a stall`).
