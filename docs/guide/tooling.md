# Command line tools

Besides `create`, `dev`, `build` and `preview`, the `blacklight` command checks the machine (`doctor`), checks a game (`lint`) and starts it on a target (`run`). Run them from the game's folder, or pass the folder as the first argument.

```sh
pnpm blacklight doctor
pnpm blacklight lint
pnpm blacklight run --target web
```

## doctor

`blacklight doctor` lists, for every target, what it needs and what this machine has. A target is `ready` when every required check passes; signing checks are warnings, because unsigned builds still work for testing.

| Target    | Required                                                                                                                       | Warnings (optional)                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `web`     | Node.js 24 or later, pnpm                                                                                                      | —                                                                                                                                |
| `win`     | Node.js, pnpm, `electron` installed in the game                                                                                | Code signing certificate: `WIN_CSC_LINK` (or `CSC_LINK`) and `WIN_CSC_KEY_PASSWORD`                                              |
| `mac`     | Node.js, pnpm, a Mac, Xcode command line tools, `electron`                                                                     | "Developer ID Application" identity in the keychain; `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for notarization |
| `linux`   | Node.js, pnpm, `electron`                                                                                                      | —                                                                                                                                |
| `steam`   | Node.js, pnpm, `electron`                                                                                                      | `steamcmd` on the `PATH` (uploads)                                                                                               |
| `android` | Node.js, pnpm, JDK 21 or later (`JAVA_HOME` or `java`), Android SDK with platform-tools (`ANDROID_HOME` or `ANDROID_SDK_ROOT`) | Release keystore: `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`                   |
| `ios`     | Node.js, pnpm, a Mac, Xcode (`xcodebuild`)                                                                                     | Apple Development or Distribution identity and `APPLE_TEAM_ID`                                                                   |

Every failed check prints how to fix it. The exit code is 0 for the full report; with `--target <name>` it is 1 when that target is not ready, so CI can stop early:

```sh
pnpm blacklight doctor --target android || exit 1
```

| Option              | Default | Effect                                           |
| ------------------- | ------- | ------------------------------------------------ |
| `--target <target>` | all     | Check one target; exit code 1 when not ready.    |
| `--json`            | off     | Print the report as JSON (one entry per target). |

Signing identities are read with `security find-identity` on macOS; nothing is read from the certificate files themselves.

## lint

`blacklight lint` checks a game against the engine's rules. It exits with code 1 when it finds an error, so it fits in CI and pre-commit hooks.

| Rule                                              | Severity | What it checks                                                                                             |
| ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `config`                                          | error    | `game.config.ts` loads and passes validation (every invalid field is listed).                              |
| `scene-file-name`, `object-file-name`             | error    | `scenes/<name>/<name>.scene.ts` and `objects/<name>/<name>.object.ts` are named after their folder.        |
| `default-export`                                  | error    | Scene and object files `export default class …`.                                                           |
| `anim-schema`, `layout-schema`, `timeline-schema` | error    | `.anim.json`, `.layout.json` and `.timeline.json` files match the engine's JSON Schemas.                   |
| `json-syntax`                                     | error    | Those files are valid JSON.                                                                                |
| `anim-source`                                     | error    | The `source` of an `.anim.json` exists next to it.                                                         |
| `layout-object`                                   | error    | Objects placed in a layout exist.                                                                          |
| `missing-asset`                                   | error    | Every `static assets` entry points to a file (or a folder, with a trailing `/`).                           |
| `unknown-scene`                                   | error    | `goto`, `overlay`, `hostScene` and `preload` name an existing scene.                                       |
| `unknown-action`                                  | error    | `input.pressed/held/released('x')` names an action of `input.actions` or a default action.                 |
| `unknown-animation`                               | warning  | `this.play('x')` in an object names an animation of its `.anim.json` (directional fallbacks are accepted). |

Names are checked where they are written as string literals; computed names are left to TypeScript, which already types scene, object and action names through `.blacklight/types.d.ts`.

When the game has `eslint` and `eslint-plugin-blacklight` installed, `lint` also runs ESLint on `scenes/`, `objects/`, `ui/` and `modules/` with the plugin's recommended rules (or with the game's own `eslint.config.js` when there is one) and reports its messages in the same list.

| Option        | Default   | Effect                                         |
| ------------- | --------- | ---------------------------------------------- |
| `--no-eslint` | ESLint on | Skip ESLint even when the plugin is installed. |
| `--json`      | off       | Print `{ issues, notes }` as JSON.             |

## run

`blacklight run --target <target>` starts the game where it will be played.

| Target                         | What happens                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `web` (default)                | Starts the dev server (hot reload included) and opens the browser on it.                                |
| `win`, `mac`, `linux`, `steam` | Runs the desktop runner: the game in its Electron window.                                               |
| `android`, `ios`               | Runs the mobile runner: builds, installs and starts the game on `--device`, or on the running emulator. |

| Option            | Default | Effect                                    |
| ----------------- | ------- | ----------------------------------------- |
| `--target <name>` | `web`   | Target to run.                            |
| `--device <id>`   | —       | Device or emulator id for mobile targets. |
| `--port <port>`   | `5173`  | Port of the dev server.                   |

Set `BROWSER=none` to start the web target without opening a browser. When a target has no runner in the installed `@blacklight/cli`, the command says so and points to `blacklight build --target <name>` and `blacklight doctor --target <name>`.

### Adding a runner

Runners live in a registry next to the build targets (`packages/cli/src/targets/runners.ts`). A platform registers its own from its file under `targets/`:

```ts
import { runners } from './runners';

runners.android = async ({ root, device, port, flags }) => {
  // build, install with adb, start the activity on `device`
};
```

The checks of `doctor` are a registry as well (`doctorChecks` in `packages/cli/src/doctor.ts`); a platform appends what its target needs.

## Limits

- `doctor` checks that tools exist and answer; it does not build anything, so a broken SDK installation can still fail at build time.
- Certificates are found by environment variables and keychain identities; their expiry dates are not checked.
- `lint` reads code with patterns, not a type checker: names built at runtime (`this.play(\`walk-${dir}\`)`) are not checked.
- Only the web target has a runner in this package; desktop and mobile runners come with their platform packages.
