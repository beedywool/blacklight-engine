# Module registry

The registry is the list of modules that `blacklight add` and `blacklight search` know. It indexes packages: a community module is published on npm like any package, and a one-file pull request on the index repository lists it; the official modules are tarballs of the engine's GitHub releases. The index is a static set of JSON files built by CI, so anyone can host one; the registry never stores package tarballs. The default registry is `https://beedywool.github.io/blacklight-engine/registry`, rebuilt by each engine release ([Deploy the module registry](./deploy-registry)).

## Commands

```sh
blacklight search save           # modules whose name, description or keywords contain "save"
blacklight add sqlite            # install a module and list it in game.config.ts
blacklight add @blacklight/ui    # install an engine package from the game's release
blacklight publish --dry-run     # check a module package before publishing it
```

### `blacklight add <module>`

Run it in a game folder. It reads `v1/modules/<module>.json` from the registry, prints the module's platforms and permissions, and checks its `engine` range against the installed `@blacklight/core`; an incompatible module stops the command. Modules listed in the manifest's `dependencies` are added first, recursively. The packages are installed with the game's package manager (`pnpm-lock.yaml` → `pnpm add`, `yarn.lock` → `yarn add`, `bun.lock` → `bun add`, otherwise `npm install`), each module gets an empty entry under `modules` in `game.config.ts` (`modules: { sqlite: {} }`), and `.blacklight/types.d.ts` is regenerated so `game.modules.sqlite` is typed at once.

| Option             | Default                                          | Meaning                                                                      |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `--registry <url>` | `BLACKLIGHT_REGISTRY`, else the default registry | Registry base URL (the folder holding `v1/`).                                |
| `--no-install`     | install                                          | Edit `game.config.ts` without running the package manager.                   |
| `--force`          | off                                              | Install a module whose `engine` range does not include the installed engine. |

Where a package comes from:

- The official modules (`http`, `sqlite`, `cloud-save`, `accounts-oidc`, `achievements`, `telemetry`) come from the engine release the game installs `@blacklight/core` from: `@blacklight/module-sqlite` is `<release>/blacklight-module-sqlite-<version>.tgz` of the same release, whatever version the registry lists, so modules and engine always match.
- A module whose registry entry has a `tarball` URL is installed from that URL; any other from npm at the registry's `version`.
- A game created with `create-blacklight --link <checkout>` installs the modules of the same checkout as `link:` dependencies.

The official modules are known to the CLI: when the registry cannot be reached, or the host has no registry (`v1/index.json` answers 404), `blacklight add` installs them and their known dependencies without the registry data (no engine check).

Some modules need configuration fields that have no default; the type check of `game.config.ts` fails until they are set. `add` names them as its last line, e.g. for `accounts-oidc`: ``add `issuer: 'https://your-provider', clientId: 'your-client-id'` to modules['accounts-oidc'] in game.config.ts`` ([OpenID Connect provider](/publishing/oidc)).

`blacklight add @blacklight/<package>` installs an engine package instead of a module (`ui`, `three`, `physics`, `net`, `native`, `mobile`, `relay`): from the same release as the game's `@blacklight/core`, or from the same checkout with `--link`. It does not touch `game.config.ts`.

When `game.config.ts` is written in an unusual way (no `defineConfig({ ... })` or `export default { ... }`), the file is left untouched and the command prints the line to add.

### `blacklight search [query]`

Without a query, lists every module. The match is case-insensitive on the name, the description and the keywords.

| Option             | Default                                          | Meaning                                     |
| ------------------ | ------------------------------------------------ | ------------------------------------------- |
| `--registry <url>` | `BLACKLIGHT_REGISTRY`, else the default registry | Registry base URL.                          |
| `--json`           | off                                              | Print the matching `v1/index.json` entries. |

### `blacklight publish [dir]`

Run it in a module package folder (default `.`). It checks the package (name, version, description, license, manifest, see below) and that the files named by `exports` (or `main`) exist, then runs `npm publish --access public`. It prints every problem at once and exits with an error before anything is published. Afterwards it prints the `entries/<name>.json` file to submit to the index repository.

| Option             | Default                                          | Meaning                                                      |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------ |
| `--dry-run`        | off                                              | Run the checks and print the npm command without running it. |
| `--registry <url>` | `BLACKLIGHT_REGISTRY`, else the default registry | Registry named in the printed instructions.                  |

Publishing needs an npm account (`npm login`); the npm tarball is the only copy of the package.

## Module packages

A module package is named `blacklight-module-<name>` or `@scope/blacklight-module-<name>`; official modules are `@blacklight/module-<name>`. `<name>` uses lowercase letters, digits and dashes and starts with a letter; it is the key under `modules` in `game.config.ts` and under `game.modules`. The package's license must be MIT-compatible: `MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `Zlib`, `0BSD` or `CC0-1.0` (an SPDX `OR` expression passes when one side does, an `AND` expression when all parts do).

The manifest is the `blacklight` field of the package's `package.json`:

```json
{
  "name": "blacklight-module-chat",
  "version": "1.0.0",
  "description": "Text chat between players of a room.",
  "license": "MIT",
  "keywords": ["blacklight-module", "chat"],
  "blacklight": {
    "module": "chat",
    "engine": "^1.0.0",
    "platforms": ["web", "desktop", "android", "ios"],
    "permissions": ["network"],
    "dependencies": ["http"]
  }
}
```

| Field          | Required | Meaning                                                                                                      |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `module`       | yes      | Module name; must match the package name.                                                                    |
| `engine`       | yes      | Semver range of `@blacklight/core` versions the module works with (`^1.0.0`).                                |
| `platforms`    | yes      | Non-empty list of `web`, `desktop`, `android`, `ios`.                                                        |
| `permissions`  | yes      | What the module does, shown before install (`[]` when nothing below applies).                                |
| `dependencies` | no       | Other modules it needs; `blacklight add` installs and configures them too. Each must be listed in the index. |

| Permission  | Meaning                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- |
| `network`   | Talks to servers.                                                                        |
| `storage`   | Writes files on the device.                                                              |
| `native`    | Has a native part: Node code in the Electron main process, a Capacitor plugin on mobile. |
| `accounts`  | Handles sign-in tokens.                                                                  |
| `telemetry` | Sends usage or crash data.                                                               |

Permissions are declarations checked by review, not a sandbox: a module runs with the game's rights.

## The index repository

The index is a Git repository with one file per module:

```
entries/
  chat.json
  sqlite.json
.github/workflows/validate.yml
README.md
```

```json
{ "name": "chat", "package": "blacklight-module-chat", "repository": "https://github.com/me/chat" }
```

| Field        | Required | Meaning                                                        |
| ------------ | -------- | -------------------------------------------------------------- |
| `name`       | yes      | Module name; equals the file name.                             |
| `package`    | yes      | npm package; its name must carry the module name.              |
| `repository` | no       | Source URL; defaults to the package's `repository` field.      |
| `official`   | no       | Set by the maintainers for modules maintained with the engine. |

A built index adds `tarball` to a module (and to each version) when it is built with `--release-url <folder>`: the official modules then point at the tarballs of that release instead of npm. The engine's release workflow builds the official index this way.

The engine repository keeps the official index and a CI template in `packages/registry/index/`. CI runs `blacklight-registry validate` on every pull request: the file name equals `name`, the package is published, its latest version passes the package checks above, its `blacklight.module` equals `name`, no package is listed twice and every dependency has an entry. On `main` and once a day, `blacklight-registry build` writes the static API and the workflow deploys it (GitHub Pages in the template). New versions of a listed package need no pull request; the daily build picks them up.

```sh
pnpm dlx --package=@blacklight/registry blacklight-registry validate .
pnpm dlx --package=@blacklight/registry blacklight-registry build . --out public
# without npm, from local package folders (a package, or a folder of packages):
blacklight-registry build . --out public --local ../engine/packages/modules
```

## Static API

Two kinds of files, served as they are by any static host (GitHub Pages, an S3 bucket, nginx):

| Path                     | Content                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `v1/index.json`          | `{ generatedAt, modules: ModuleSummary[] }`, sorted by name.              |
| `v1/modules/<name>.json` | `ModuleSummary` plus `versions`: the manifest of every published version. |

```json
{
  "name": "sqlite",
  "package": "@blacklight/module-sqlite",
  "version": "1.0.0",
  "description": "Local SQLite databases for Blacklight Engine games…",
  "keywords": ["blacklight", "blacklight-module", "sqlite"],
  "platforms": ["web", "desktop", "android", "ios"],
  "permissions": ["storage", "native"],
  "engine": "^1.0.0",
  "dependencies": [],
  "official": true,
  "license": "MIT",
  "versions": {
    "1.0.0": {
      "engine": "^1.0.0",
      "platforms": ["web", "desktop", "android", "ios"],
      "permissions": ["storage", "native"],
      "dependencies": []
    }
  }
}
```

`version` is the npm `latest` tag. Versions whose manifest is invalid are left out of `versions`.

## Self-hosting

Copy `packages/registry/index/` into a new repository, adjust the deploy job to your host, and point the CLI at it:

```sh
export BLACKLIGHT_REGISTRY=https://modules.example.com
blacklight search
```

`--registry` on a command overrides the variable. The default registry is the engine's, on GitHub Pages: `https://beedywool.github.io/blacklight-engine/registry`.

## Limits

- The registry lists packages; npm or a GitHub release hosts them. A package removed from npm breaks `blacklight add` for it, whatever the index says.
- Validation checks names, manifests and licenses, not code. Permissions are declarations, not enforced.
- The engine check compares the manifest's `engine` range with the installed `@blacklight/core`; it cannot tell whether a module actually works with that version.
- Offline, `blacklight add` only knows the official modules and installs their latest version without the engine check.
- `game.config.ts` is edited as text; unusual layouts get a printed instruction instead of an edit.
