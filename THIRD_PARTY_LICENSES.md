# Third-party licenses

Every dependency that ships inside a game or a published package, and every asset pack. Development-only tools (TypeScript, ESLint, Vitest, Playwright, tsup) are not listed.

## Runtime (inside games)

| Package                 | Version | License      | Used by          |
| ----------------------- | ------- | ------------ | ---------------- |
| pixi.js                 | 8.22.0  | MIT          | @blacklight/core |
| @pixi/colord            | 2.9.6   | MIT          | pixi.js          |
| @xmldom/xmldom          | 0.8.15  | MIT          | pixi.js          |
| earcut                  | 3.2.4   | ISC          | pixi.js          |
| eventemitter3           | 5.0.4   | MIT          | pixi.js          |
| gifuct-js               | 2.1.2   | MIT          | pixi.js          |
| js-binary-schema-parser | 2.0.3   | MIT          | gifuct-js        |
| ismobilejs              | 1.1.1   | MIT          | pixi.js          |
| parse-svg-path          | 0.2.0   | MIT          | pixi.js          |
| tiny-lru                | 11.4.7  | BSD-3-Clause | pixi.js          |

## Tooling packages (published, not inside games)

| Package | Version | License | Used by         |
| ------- | ------- | ------- | --------------- |
| vite    | 8.3.5   | MIT     | @blacklight/cli |
| cac     | 7.1.0   | MIT     | @blacklight/cli |

## Documentation site

| Package or asset              | Version | License                                         |
| ----------------------------- | ------- | ----------------------------------------------- |
| vitepress                     | 1.6.4   | MIT                                             |
| vue                           | 3.5.44  | MIT                                             |
| Google Sans Flex (font files) | —       | SIL Open Font License 1.1                       |
| BlackLight logo               | —       | © BlackLight, used with permission of the owner |

## Mobile (inside Android and iOS apps, `@blacklight/mobile`)

| Package                                                     | Version         | License                                   | Used by                                                            |
| ----------------------------------------------------------- | --------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| @capacitor/core                                             | 8.6.0           | MIT                                       | @blacklight/mobile                                                 |
| @capacitor/android                                          | 8.6.0           | MIT                                       | Android apps                                                       |
| @capacitor/ios                                              | 8.6.0           | MIT                                       | iOS apps (capacitor-swift-pm)                                      |
| @capacitor/app                                              | 8.1.2           | MIT                                       | @blacklight/mobile                                                 |
| @capacitor/browser                                          | 8.0.5           | MIT                                       | @blacklight/mobile                                                 |
| @capacitor/filesystem                                       | 8.1.5           | MIT                                       | @blacklight/mobile                                                 |
| io.ionic.libs:ionfilesystem (Android/iOS)                   | 1.1.1           | MIT                                       | @capacitor/filesystem                                              |
| @capacitor/haptics                                          | 8.0.2           | MIT                                       | @blacklight/mobile                                                 |
| @capacitor/screen-orientation                               | 8.0.2           | MIT                                       | @blacklight/mobile                                                 |
| @capacitor-community/keep-awake                             | 8.0.1           | MIT                                       | @blacklight/mobile                                                 |
| capacitor-secure-storage-plugin                             | 0.13.0          | MIT                                       | @blacklight/mobile (save key, secure-storage)                      |
| SwiftKeychainWrapper                                        | 4.x             | MIT                                       | capacitor-secure-storage-plugin (iOS)                              |
| @capacitor-community/sqlite                                 | 8.1.1           | MIT                                       | SQLite builds only                                                 |
| SQLCipher for Android                                       | 4.17.0          | BSD-3-Clause                              | @capacitor-community/sqlite (Android)                              |
| jeep-sqlite                                                 | 2.x             | MIT                                       | @capacitor-community/sqlite (web fallback, not bundled in apps)    |
| AndroidX libraries (appcompat, core, webkit, room, sqlite…) | per Capacitor 8 | Apache-2.0                                | Capacitor Android                                                  |
| Apache Cordova Android (compat layer)                       | 14.0.1          | Apache-2.0                                | @capacitor/android                                                 |
| play-services-games-v2                                      | 22.1.0          | Android SDK License (proprietary, Google) | Only apps with `mobile.playGamesAppId` (optional, like Steamworks) |
| GameKit                                                     | iOS SDK         | Apple SDK                                 | `gamecenter` (system framework)                                    |

## Mobile tooling (in `@blacklight/cli`, not inside games)

| Package        | Version | License    | Used by                                   |
| -------------- | ------- | ---------- | ----------------------------------------- |
| @capacitor/cli | 8.6.0   | MIT        | @blacklight/cli (`--target android\|ios`) |
| native-run     | 2.0.3   | MIT        | @capacitor/cli                            |
| plist          | 5.0.0   | MIT        | @blacklight/cli (Info.plist)              |
| Gradle wrapper | 8.14.3  | Apache-2.0 | generated Android project                 |

## Light 3D (`@blacklight/three`, inside games that use it)

| Package or asset                                  | Version  | License    | Used by                                                 |
| ------------------------------------------------- | -------- | ---------- | ------------------------------------------------------- |
| three                                             | 0.186.1  | MIT        | @blacklight/three                                       |
| Draco decoder (three/examples/jsm/libs/draco)     | in three | Apache-2.0 | DRACOLoader, emitted into builds, loaded on demand      |
| Basis Universal transcoder (three/.../libs/basis) | in three | Apache-2.0 | KTX2Loader, emitted into builds, loaded on demand       |
| @types/three                                      | 0.186.0  | MIT        | @blacklight/three public types (no runtime code)        |
| templates/2d-with-3d/models (hero, crate)         | —        | CC0        | generated by packages/three/scripts/generate-models.mjs |

## Official modules (inside games that use them)

| Package        | Version | License       | Used by                                                           |
| -------------- | ------- | ------------- | ----------------------------------------------------------------- |
| sql.js         | 1.15.2  | MIT           | @blacklight/module-sqlite (web backend, lazy chunk)               |
| SQLite         | 3.x     | Public domain | compiled into sql.js and better-sqlite3                           |
| better-sqlite3 | 13.0.3  | MIT           | @blacklight/module-sqlite/native (desktop, Electron main process) |

`@blacklight/module-http`, `-cloud-save`, `-accounts-oidc`, `-achievements` and `-telemetry` have no runtime dependencies (WebCrypto PKCE, hand-written Sentry envelopes).

## Module registry and reference server (published, not inside games)

| Package or image | Version | License                          | Used by                                                    |
| ---------------- | ------- | -------------------------------- | ---------------------------------------------------------- |
| semver           | 7.8.5   | ISC                              | @blacklight/cli, @blacklight/registry                      |
| node:24-alpine   | 24      | MIT (Node.js), Alpine components | servers/reference Docker image; the server has no npm deps |

## Relay server (Docker image; desktop builds that host LAN games)

| Package | Version | License | Used by                                                  |
| ------- | ------- | ------- | -------------------------------------------------------- |
| ws      | 8.22.0  | MIT     | @blacklight/relay (bundled into the image's `relay.cjs`) |

`@blacklight/net` and `eslint-plugin-blacklight` have no runtime dependencies.

## Tooling added by phase 3g (CLI and VS Code extension)

| Package                  | Version | License    | Used by                                                              |
| ------------------------ | ------- | ---------- | -------------------------------------------------------------------- |
| magic-string             | 1.4.5   | MIT        | @blacklight/cli (hot reload transform, dev only)                     |
| typescript               | 6.0.3   | Apache-2.0 | VS Code extension (bundled: `game.config.ts` form, scene code edits) |
| @blacklight/core (parts) | —       | MIT        | VS Code extension (bundled: animation and sheet resolution)          |

Development tools of the extension, not shipped: @vscode/test-electron 3.1.0 (MIT), @vscode/vsce 4.0.0 (MIT), ovsx 1.3.0 (EPL-2.0, publishing CLI only), @types/vscode 1.125.0 (MIT), happy-dom 21.0.4 (MIT).
