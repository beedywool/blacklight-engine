# Contributing

Blacklight Engine is a pnpm monorepo. `SPEC.md` says what the engine must do, `PROGRESS.md` what is done, `DECISIONS.md` why things are the way they are.

## Setup

Requires Node.js 24+ and [pnpm](https://pnpm.io/installation) 12+. Install the dependencies (`pnpm install`) before running anything.

```sh
pnpm install
pnpm build          # every package in packages/
pnpm exec playwright install chromium   # once: the core-browser unit tests and the e2e tests need it
pnpm test           # unit tests (Vitest), including core-browser in headless Chromium
pnpm test:coverage  # NF-07 gate: coverage of core and net, fails below the thresholds
pnpm lint           # ESLint + Prettier check
pnpm typecheck
pnpm api:check      # public API documented and typed, api-report.txt up to date (after pnpm build)
pnpm e2e            # browser tests (Playwright)
pnpm e2e --update-snapshots   # after an intended visual change, then review the new images
pnpm bench          # NF-01/NF-02 benchmarks, alone on an idle machine; fails on a regression > 10 %
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

## Unit tests and coverage

Unit tests are Vitest projects listed in the root `vitest.config.ts`: one per package (`test/**/*.spec.ts`), plus `core-browser`, which runs `packages/core/test/browser/*.spec.ts` in headless Chromium through Playwright (`packages/core/vitest.browser.config.ts`). Code that needs a real browser (the Pixi renderer and `createGame`, sprites and sheets, Web Audio, asset loading, IndexedDB, DOM input listeners, the debug overlay) is tested there against the real APIs; the tests build their files in the page (canvas PNGs, generated WAVs, blob URLs) and `startGame()` in `test/browser/helpers.ts` starts a real game that is destroyed after each test. Everything else stays in Node.

```sh
pnpm vitest run --project core-browser                 # browser tests only
pnpm vitest run --project core-browser --browser.headless=false   # watch them run in a window
pnpm vitest run --project core test/save.spec.ts       # one Node file
pnpm test:coverage                                     # core, core-browser, net and relay with v8 coverage
```

`pnpm test:coverage` merges the Node and Chromium runs, prints a summary, writes `coverage/index.html`, and fails when `packages/core/src` or `packages/net/src` drops below 80 % of statements, lines, functions or branches (NF-07; CI runs it on Linux). Run it through the script: with other `--project` filters the report covers other files, and without any the include pattern matches nothing. When a change lowers coverage, add a test of the behaviour you changed, not a call that only touches lines. Only generated data is excluded (`coverage.exclude`, each entry with the reason); code that needs hardware is tested against a fake of the browser API and listed in `MANUAL_TESTS.md`.

## CI

`.github/workflows/ci.yml` runs in two tiers.

- **Fast tier**, on every push and pull request, and it must stay green (about 15 minutes): lint, type checks, unit tests, the coverage gate, `api:check`, the docs build and two template builds on Linux; `pnpm test` (unit tests, including the relay's Node test of two headless party-game instances playing online) and the VS Code extension tests on Windows and macOS; the e2e suite on Linux in eight shards, without the tests tagged `@flaky`; the desktop installers of the three systems.
- **Full tier**, every night and on `workflow_dispatch`, never blocking a push: everything above, the e2e suite on macOS too, every `@flaky` test, one more retry for the specs that draw a lot (`e2e/tiers.ts`), the benchmarks on Linux and macOS, the Android emulator and the iOS Simulator. The dispatch inputs `jobs`, `os` and `spec` pick part of it, e.g. `gh workflow run ci.yml --ref main -f jobs=e2e -f os='["macos-latest"]' -f spec="e2e/ui.spec.ts"`.

In CI the benchmarks check the spec's absolute limits only (`BLACKLIGHT_BENCH_LIMITS_ONLY=1`): NF-01 60 fps where the runner has a hardware GPU, NF-02 under 3 s on desktop and 5 s on mobile, NF-03 under 300 MB. Shared runners vary from one run to the next by more than 10 %, so the regression gate against `e2e/bench-baseline.json` runs locally with `pnpm bench` on a stable machine.

GitHub's Windows runners have no GPU, and their software rendering made the Windows e2e tests and benchmarks fail at random, so CI runs neither on Windows. Run them on a real Windows machine before a release and after changes to the desktop platform, input, rendering or the CLI (next section).

### e2e tests and benchmarks on Windows

Prerequisites: Windows 10 or 11 with a GPU and its vendor driver, Node.js 24+, pnpm 12+, Git for Windows, and about 15 GB free on the system drive (the template tests install and package six games in `%TEMP%`). The tests start dev servers on ports 5190 to 5500; let Node.js through the firewall on private networks when Windows asks, and leave the machine alone while the benchmarks run.

```sh
pnpm install
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm e2e                    # an hour or more; e2e/desktop.spec.ts packages and starts the Electron app
pnpm e2e e2e/party-game.spec.ts --grep "AIR HOCKEY"   # one spec or test
pnpm bench                  # NF-01 and NF-02, compared with this machine's baseline
```

What to look at:

- `pnpm e2e` ends with a summary; a failure leaves a report (`pnpm exec playwright show-report`) with the trace of each failed test. Windows has its own screenshot references (`e2e/__screenshots__/**/win32/`, and the party-game ones per platform): a missing reference is written and the test passes, so review new images under `e2e/__screenshots__/` with `git status` before committing them.
- Tests skipped on Windows say why in the report (the two-browser online matches, WebKit without Web Audio); the relay test covers online play there.
- The first `pnpm bench` on a machine has no baseline: it writes `bench-results/*.json` and passes. Store the results as this machine's baseline with `BLACKLIGHT_BENCH_UPDATE=1 pnpm bench` and commit `e2e/bench-baseline.json`. Later runs print one `[bench]` line per metric with its change from the baseline and fail on a regression above 10 %; NF-02 also fails when the median start reaches 3 s.
- Note the results of a release check in `docs/benchmarks.md` (machine, GPU, Windows version, date).

### Known flaky tests

A test that fails now and then without a known cause gets `@flaky` at the end of its title, e.g. `test('pause menu and level screenshot @flaky', …)`, and a line here with the failing run. The fast tier leaves it out (`--grep-invert=@flaky`); the full tier still runs it. Remove the tag and the line once the cause is fixed.

None at the moment. The last intermittent failures had a cause that was fixed: the platformer pause test (three key presses within one frame counted as one) and the NF-01 benchmark on Windows (the PWA service worker precaching the whole build during the measure); the Air Hockey timeout happened on GitHub's Windows runners only, which no longer run the e2e suite.

## Layout

| Folder                             | Content                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`                    | `@blacklight/core`: the runtime                                                                                                                         |
| `packages/ui`                      | `@blacklight/ui`: Vue UI layer (`prompts/` holds Kenney's CC0 glyphs; its build runs `scripts/prompt-urls.mjs`, which regenerates `src/prompt-urls.js`) |
| `packages/three`, `physics`, `net` | optional runtime packages: 3D, rigid bodies, online play                                                                                                |
| `packages/native`, `mobile`        | desktop (Electron) and mobile (Capacitor) platforms                                                                                                     |
| `packages/modules/*`, `registry`   | official modules and the module registry                                                                                                                |
| `packages/eslint-plugin`           | `eslint-plugin-blacklight` (deterministic simulation code)                                                                                              |
| `packages/cli`                     | `@blacklight/cli`: the `blacklight` command, its Vite configuration, build targets and runners                                                          |
| `packages/create`                  | `create-blacklight`: the project scaffolder                                                                                                             |
| `packages/vscode`                  | VS Code extension (`pnpm --filter blacklight-vscode test:integration` runs its integration tests under Xvfb)                                            |
| `servers/`                         | relay and reference server (Docker)                                                                                                                     |
| `templates/`                       | project templates, copied by `create-blacklight`                                                                                                        |
| `docs/`                            | VitePress documentation site                                                                                                                            |
| `e2e/`                             | Playwright tests, including the phase gates; `e2e/fixtures/` holds test games (generators for their art and media sit next to them)                     |

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

Every published package (`@blacklight/*`, `create-blacklight`, `eslint-plugin-blacklight`, `blacklight-vscode`) carries the same version, and a game depends on the tarballs of one release, so one number tells which engine a game runs on. Versions follow [semantic versioning](https://semver.org) from 1.0:

- **Major** (`2.0.0`): a change to a public API, a configuration field, a file format (saves, `.anim.json`, registry index) or a supported platform that makes an existing game fail to build or behave differently. Saves written by the previous major stay readable through save migrations.
- **Minor** (`1.1.0`): new features, new optional configuration, deprecations (the old API keeps working and logs how to move until the next major).
- **Patch** (`1.0.1`): fixes that change no documented behaviour.

The public API is every symbol exported from an entry point of a published package (`exports` in its `package.json`, listed in `scripts/api-entries.mjs`), with its TypeScript types, plus the documented behaviour (TSDoc and the guides). Symbols marked `@internal` are not part of it. `api-report.txt` lists that surface, one line per symbol with its signature, and `pnpm api:check` fails when it is out of date, so every API change shows up in the diff of a pull request. Read that diff as follows:

- **Breaking** (major, `!` in the commit message): a removed or renamed export, member or entry point; a new required parameter, property or configuration field; a parameter type narrowed or a return type widened (a caller's argument or a reader's assumption no longer type-checks); an optional property made required; a type alias or union narrowed; a class member made `readonly`, `protected` or `abstract`; a change of default value or behaviour that games observe.
- **Not breaking** (minor): a new export, entry point, optional parameter or optional property; a parameter type widened; a return type narrowed; a symbol newly marked `@deprecated`.
- Removing `@internal` from a symbol adds it to the API (minor); marking a public symbol `@internal` removes it (major).

Before 1.0, minor versions may break.

Releases are published on GitHub only: no npm, no VS Code Marketplace for now (both may come later). `.github/workflows/release.yml` runs on every `v*` tag:

1. `pack` sets every package to the tag's version, builds them, packs each published package with `scripts/release-pack.mjs` (all of `packages/`, `packages/modules/` and the relay; each `workspace:` engine dependency becomes the URL of the same release's asset, `https://github.com/beedywool/blacklight-engine/releases/download/v<version>/<package>-<version>.tgz`), adds `create-blacklight.tgz` (the scaffolder under a name `releases/latest/download/` can point at), packages the extension as `blacklight-vscode-<version>.vsix`, builds the module registry with the official modules pointing at the release's tarballs, and writes the release notes with `pnpm changelog --notes <version>`, after the summary in `docs/release-notes-<major>.<minor>.md` for a `x.y.0` release that has one (`docs/release-notes-1.0.md`: what the version delivers, what is checked by hand, the accepted limitations);
2. `release` creates the GitHub Release of the tag with every file attached (a version with `-` is a prerelease);
3. `registry` deploys the registry to GitHub Pages (`https://beedywool.github.io/blacklight-engine/registry`).

To cut a release, from a clean `main` with CI green:

```sh
pnpm -r --filter "./packages/**" --filter "./servers/*" exec npm pkg set version=1.1.0   # one version everywhere
git commit -am "release: 1.1.0"
git tag v1.1.0
pnpm changelog                    # rewrites CHANGELOG.md from the git history, 1.1.0 included
git commit -a --amend --no-edit   # the release commit carries its changelog
git tag -f v1.1.0
git push origin main
git push origin v1.1.0            # starts the release workflow
gh run watch "$(gh run list --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

The workflow sets the versions from the tag in any case, so a forgotten bump still releases consistent packages, but the commit should carry the version (`create-blacklight --link` and `blacklight --version` read it). A failed run creates no release: fix the cause, move the tag (`git tag -f v1.1.0 && git push -f origin v1.1.0`) and the workflow runs again. GitHub Pages must be enabled with "GitHub Actions" as its source for the `registry` job.

To check the packaging without releasing, run the workflow by hand: it is a dry run by default, which builds everything and uploads it to the run instead of a release.

```sh
gh workflow run release.yml --ref main                    # version 0.0.0-dev.<run number>
gh workflow run release.yml --ref main -f version=1.1.0   # the files 1.1.0 would have
gh run download <run id> --dir release-check
```

`e2e/release.spec.ts` does the same locally on every CI run: it packs every package, serves the folder over HTTP under the asset names, creates a game with `pnpm dlx <folder>/create-blacklight.tgz` (`BLACKLIGHT_RELEASE_URL` points create-blacklight and `blacklight upgrade` at the local folder), installs it with plain `pnpm install`, builds it, adds a module and upgrades it to a second packed version. `node scripts/release-pack.mjs --version 1.1.0 --out release` packs by hand after `pnpm build`.

`pnpm changelog` (`scripts/changelog.mjs`) writes one section per `v*` tag and an "Unreleased" section for the commits after the last one, grouped by area, with breaking changes listed first. Do not edit `CHANGELOG.md` by hand: fix the history or the script instead.
