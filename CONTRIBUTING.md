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
pnpm api:check      # public API documented and typed, api-report.txt up to date (after pnpm build)
pnpm e2e            # browser tests (Playwright; first run: pnpm exec playwright install chromium)
pnpm e2e --update-snapshots   # after an intended visual change, then review the new images
pnpm bench          # NF-01 benchmark, alone on an idle machine; fails on a regression > 10 %
BLACKLIGHT_BENCH_UPDATE=1 pnpm bench   # after an intended performance change: new baseline
pnpm docs:dev       # documentation on http://localhost:5173
pnpm docs:screenshots   # retake the pictures of the installation and getting-started guides
```

The guide pictures in `docs/guide/captures/` come from `e2e/guide-captures.spec.ts`; retake them after a change to the CLI output, the `empty` template, the getting-started project or the VS Code extension, and review them before committing. The first run downloads VS Code into `packages/vscode/.vscode-test/`, like the extension's integration tests.

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
- Every public symbol has TSDoc, top-level classes and functions with a short example; no `any` in public types (`pnpm api:check`, below). Every error says what went wrong and how to fix it.
- A pull request that changes behaviour adds or updates a test, and updates `PROGRESS.md` with the requirement ID it covers.
- Dependencies are pinned to exact versions and must be MIT-compatible (MIT, BSD, Apache-2.0, ISC, zlib, CC0); add runtime ones to `THIRD_PARTY_LICENSES.md`.
- Commit messages: `area: what changed` in the imperative (`core: cap catch-up steps after a stall`). The area is the package or folder (`core`, `ui`, `cli`, `templates`, `docs`…); mark a change that breaks the public API with `!` after the area (`ui!: rename MenuList's select event`) or a `BREAKING CHANGE: …` line in the body. The changelog is built from these messages.

## Documenting the public API

`pnpm api:check` (`scripts/api-check.mjs`, run by CI after `pnpm build` and by `pnpm docs:build`) reads the declarations in each package's `dist/` with TypeDoc, like the API reference, and fails when:

- a public class, interface, function, method, property, accessor, type alias, enum, enum member or variable has no TSDoc comment (constructors are covered by their class, a getter's comment covers its setter);
- a top-level class or function has no `@example`;
- a public type contains `any`;
- an entry point has a default export;
- a public type is written as `typeof` of a declaration that is not exported (`ReturnType<typeof createHttp>`), which hides its shape from the reference and the report;
- `api-report.txt` does not match the declarations.

Each problem names the entry point and the symbol (`@blacklight/core: Sprite.flipX (accessor) has no TSDoc comment`). Write the comment in the package's `src/`, rebuild the package and run the check again. A comment says in one or two sentences what the symbol does and when to use it, documents parameters, return values and thrown errors that are not obvious from the types, and ends with a short example that a game would write (required on top-level classes and functions, welcome on members):

````ts
/**
 * Plays an animation. Calling it every step with the same name keeps it running; `restart`
 * starts it over. A missing name falls back to the closest one (`walk-left` → `walk-right`
 * mirrored, `walk`, then the default animation) with a warning.
 *
 * @param options - `restart` starts the animation over, `speed` multiplies its frame rate.
 * @returns The sprite, for chaining.
 *
 * @example
 * ```ts
 * this.play(this.velocity.length > 0 ? 'run' : 'idle');
 * ```
 */
````

Engine plumbing that games never use (hooks between packages, test helpers of the engine itself) is marked `/** @internal Why. */` instead: the API reference and the check leave it out, and it may change in any release. Do not hide something a game, a template or the guides use. After an intended API change, run `pnpm api:check --update` and review the diff of `api-report.txt` with the rules of "Versions and releases"; `scripts/api-check.test.mjs` proves each check fails on a fixture with an undocumented symbol, a missing example, `any` and a default export.

## Versions and releases

Every published package (`@blacklight/*`, `create-blacklight`, `blacklight-vscode`) carries the same version, and games depend on `^<version>` of each, so one number tells which engine a game runs on. Versions follow [semantic versioning](https://semver.org) from 1.0:

- **Major** (`2.0.0`): a change to a public API, a configuration field, a file format (saves, `.anim.json`, registry index) or a supported platform that makes an existing game fail to build or behave differently. Saves written by the previous major stay readable through save migrations.
- **Minor** (`1.1.0`): new features, new optional configuration, deprecations (the old API keeps working and logs how to move until the next major).
- **Patch** (`1.0.1`): fixes that change no documented behaviour.

The public API is every symbol exported from an entry point of a published package (`exports` in its `package.json`, listed in `scripts/api-entries.mjs`), with its TypeScript types, plus the documented behaviour (TSDoc and the guides). Symbols marked `@internal` are not part of it. `api-report.txt` lists that surface, one line per symbol with its signature, and `pnpm api:check` fails when it is out of date, so every API change shows up in the diff of a pull request. Read that diff as follows:

- **Breaking** (major, `!` in the commit message): a removed or renamed export, member or entry point; a new required parameter, property or configuration field; a parameter type narrowed or a return type widened (a caller's argument or a reader's assumption no longer type-checks); an optional property made required; a type alias or union narrowed; a class member made `readonly`, `protected` or `abstract`; a change of default value or behaviour that games observe.
- **Not breaking** (minor): a new export, entry point, optional parameter or optional property; a parameter type widened; a return type narrowed; a symbol newly marked `@deprecated`.
- Removing `@internal` from a symbol adds it to the API (minor); marking a public symbol `@internal` removes it (major).

Before 1.0, minor versions may break.

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
