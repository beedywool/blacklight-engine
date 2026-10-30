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
- Commit messages: `area: what changed` in the imperative (`core: cap catch-up steps after a stall`). The area is the package or folder (`core`, `ui`, `cli`, `templates`, `docs`…); mark a change that breaks the public API with `!` after the area (`ui!: rename MenuList's select event`) or a `BREAKING CHANGE: …` line in the body. The changelog is built from these messages.

## Versions and releases

Every published package (`@blacklight/*`, `create-blacklight`, `blacklight-vscode`) carries the same version, and games depend on `^<version>` of each, so one number tells which engine a game runs on. Versions follow [semantic versioning](https://semver.org) from 1.0:

- **Major** (`2.0.0`): a change to a public API, a configuration field, a file format (saves, `.anim.json`, registry index) or a supported platform that makes an existing game fail to build or behave differently. Saves written by the previous major stay readable through save migrations.
- **Minor** (`1.1.0`): new features, new optional configuration, deprecations (the old API keeps working and logs how to move until the next major).
- **Patch** (`1.0.1`): fixes that change no documented behaviour.

The public API is what the packages export and document (TSDoc and the guides); names starting with `_` and symbols marked `@internal` are not part of it. Before 1.0, minor versions may break.

To release, from a clean `main` with CI green:

```sh
pnpm -r --filter "./packages/**" exec npm pkg set version=1.1.0   # every package, one version
git commit -am "release: 1.1.0"
git tag v1.1.0
pnpm changelog                    # rewrites CHANGELOG.md from the git history, 1.1.0 included
git commit -a --amend --no-edit   # the release commit carries its changelog
git tag -f v1.1.0
git push --follow-tags
```

`pnpm changelog` (`scripts/changelog.mjs`) writes one section per `v*` tag and an "Unreleased" section for the commits after the last one, grouped by area, with breaking changes listed first. Do not edit `CHANGELOG.md` by hand: fix the history or the script instead.
