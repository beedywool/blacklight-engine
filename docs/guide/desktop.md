# Desktop and Steam

The desktop app is Electron running your web build. It needs `@blacklight/native` in the game:

```sh
pnpm add @blacklight/native
pnpm blacklight desktop               # the game in the desktop app, with hot reload
pnpm blacklight build --target linux  # AppImage + deb in release/linux/
pnpm blacklight build --target win    # NSIS installer + portable .exe in release/win/
pnpm blacklight build --target mac    # dmg + zip, x64 and arm64, in release/mac/
pnpm blacklight build --target steam  # Steam depots and steamcmd scripts in release/steam/
```

`blacklight run --target <win|mac|linux|steam>` does the same as `blacklight desktop`. No code changes between targets: the CLI adds the `desktop()` plugin from `@blacklight/native` to desktop builds, which replaces `game.platform` with the desktop platform and reads gamepads through SDL; in a web build the same imports do nothing.

## How the app is built

| Piece         | What it does                                                                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app://game/` | A privileged custom scheme serves the web build from the package, so `fetch()`, modules and workers work offline as on a web server (no `file://`). Release responses carry the CSP header.                                               |
| Window        | One `BrowserWindow`: `contextIsolation`, `sandbox`, no `nodeIntegration`, no `webviewTag`, navigation to other origins refused, links opened in the system browser, permissions limited to fullscreen, pointer lock and clipboard writes. |
| Preload       | Exposes one object, `window.blacklightNative`, with three members: `info`, `invoke(module, method, args)` and `subscribe(listener)`. No Node, no Electron object reaches the page.                                                        |
| IPC bridge    | `invoke` reaches only registered native modules and methods, from the game's own top frame; every argument is checked against a declared shape before the handler runs.                                                                   |
| Main process  | The engine's Electron code, compiled to V8 bytecode in release builds; the native parts of your modules next to it.                                                                                                                       |
| Packages      | electron-builder with the release fuses, an ASAR archive, native addons unpacked beside it.                                                                                                                                               |

The page talks to the main process only through `game.platform`:

| Native module    | Methods                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `files`          | `read`, `write` (atomic), `remove`, `list`: relative paths inside the data folder; `..`, absolute paths and odd characters are refused. |
| `keystore`       | `saveKey()`: the per-install save key, from Electron `safeStorage`.                                                                     |
| `secure-storage` | `get(key)`, `set(key, value)`, `remove(key)`: small secrets (refresh tokens) encrypted by the OS keystore.                              |
| `window`         | `setFullscreen(on)`, `isFullscreen()`.                                                                                                  |
| `shell`          | `openUrl(url)` (http, https, mailto), `quit()`.                                                                                         |
| `sdl`            | Gamepads (below).                                                                                                                       |
| `steam`          | Steamworks (below), steam target only.                                                                                                  |
| `discord`        | Rich Presence (below), with `discord.appId` in the config.                                                                              |
| `relay`          | `start({ port? })`, `stop()`, `status()`: host a LAN room from the app (see [Relay server](./networking-relay)).                        |
| `deeplinks`      | Links that opened the app before the game listened; the game receives them as the `deeplink` platform event.                            |

Modules add their own with `defineNative` (see [Native parts](./modules-native)): the build bundles each configured module's native part into the app; Node addons it imports ship in `native_modules/`.

The app registers the game id as a URL scheme (`com.example.mygame:/oauth/callback`): links to it open the game and arrive as `game.platform.on('deeplink', ({ url }) => …)`. Accounts use it for the OIDC redirect.

## Window

```ts
window: { fullscreen: false, resizable: true, minSize: { width: 960, height: 540 } },
```

| Field        | Default                                      | Meaning                                                        |
| ------------ | -------------------------------------------- | -------------------------------------------------------------- |
| `fullscreen` | `false`                                      | Start in fullscreen. The player's last choice wins afterwards. |
| `resizable`  | `true`                                       |                                                                |
| `size`       | design resolution, fit to 80 % of the screen | First windowed content size.                                   |
| `minSize`    | half the design resolution                   | Smallest content size.                                         |

In windowed mode the content keeps the aspect ratio of `resolution`, also on window managers that ignore Electron's aspect-ratio hint (the app corrects the height after a resize). F11 and Alt+Enter (Cmd+Ctrl+F on macOS) toggle fullscreen; `setFullscreen(game, on)` and `isFullscreen(game)` from `@blacklight/native` do it from a menu, and `game.platform.quit()` closes the app. Closing the window quits on every OS, macOS included.

## Gamepads (SDL)

On desktop, gamepads are read by SDL in the main process (@kmamal/sdl, SDL 2) instead of Chromium's Gamepad API: SDL knows more controllers and reports rumble, trigger rumble and LEDs. The main process loads the engine's bundled SDL_GameControllerDB (the same file core uses on the web, refreshed with `pnpm --filter @blacklight/core update:gamepads`) on top of SDL's own mappings, opens every controller, follows hot-plugging and sends each change over the bridge. In the page the pads look like standard-mapping browser gamepads, so actions, rebinding, players joining and the UI's button glyphs work unchanged.

```ts
import { gamepad } from '@blacklight/native';

const pad = gamepad(this.game, 0); // index as in game.input.gamepads
if (pad.hasLed) await pad.led('#ff2200');
if (pad.hasRumbleTriggers) await pad.rumbleTriggers(0.2, 0.8, 300);
this.input.player(1).rumble(1, 0.5, 200); // same call on every platform
```

When SDL cannot load (a build made for another OS, see Limits) the game falls back to the Gamepad API.

## Steam

```ts
steam: { appId: 480 }, // 480 is Valve's test app; use yours
```

`blacklight build --target steam` builds an unpacked app for this OS with steamworks.js (on a Mac one universal app, x64 + arm64, for Intel and Apple silicon Macs; on Windows and Linux this machine's architecture; `--arch` forces one), copies it to `release/steam/content/<os>/` and writes the steamcmd scripts (`scripts/app_build_<appId>.vdf`, one `depot_build_<depot>.vdf` per OS; depots default to `appId + 1`, `+ 2`, `+ 3` for Windows, macOS, Linux, or set `steam.depots`). Build on each OS, then upload:

```sh
pnpm blacklight upload --target steam --dry-run   # prints the steamcmd command, uploads nothing
STEAM_USERNAME=builder pnpm blacklight upload --target steam
```

A packaged Steam build started outside Steam asks Steam to start it (`restartAppIfNecessary`). In the game:

```ts
import { steam } from '@blacklight/native';

const services = steam(this.game); // available: false outside the steam target
await services.unlock('FIRST_WIN');
await services.setRichPresence('steam_display', '#InMatch');
await services.openOverlay('achievements');
this.game.save.useCloud(services.cloud); // Steam Cloud for saves
```

The `steam` native module also answers the names the achievements and cloud-save modules use (`activateAchievement`, `cloudWrite(name, base64)`, `cloudRead`, `cloudList`).

## Discord Rich Presence

```ts
discord: { appId: '123456789012345678' }, // from the Discord developer portal
```

```ts
import { discord } from '@blacklight/native';

const presence = discord(this.game);
await presence.setActivity({
  details: 'Air Hockey',
  state: 'In a match',
  startTimestamp: Date.now(),
  largeImageKey: 'logo',
  party: { id: room.id, size: 2, max: 4, joinSecret: room.code },
});
presence.onJoin((code) => this.game.goto('lobby', { code })); // Join clicked on a friend's profile
presence.onJoinRequest((user) => presence.accept(user.id)); // "Ask to join"
```

The app speaks Discord's local RPC protocol directly (no Discord SDK). When Discord is not running it retries every 15 seconds and sends the last presence once connected. On the web and without `discord.appId`, every call does nothing.

## What you need to provide

Certificates, keys and store accounts always come from you, the game developer; the engine ships none and never refers to anyone else's. Without them every desktop build still works: it is unsigned, and the CLI says what is missing (`Windows: unsigned …`, `macOS: unsigned …`).

| Credential                                    | Where to get it                                                                             | Paid or free                                      | Environment variable                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Windows code signing, Azure Trusted Signing   | [Windows code signing](../publishing/windows#azure-trusted-signing-cheapest-trusted-option) | paid, monthly                                     | `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, `AZURE_SIGNING_PUBLISHER`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |
| Windows code signing, certificate in a `.pfx` | [Windows code signing](../publishing/windows#a-pfx-file)                                    | paid (public CA) or free (self-signed, test only) | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                                                                                                                             |
| Apple Developer Program membership            | [Apple](../publishing/apple#_1-enroll-in-the-apple-developer-program)                       | paid, yearly                                      | `APPLE_TEAM_ID`                                                                                                                                                    |
| Developer ID Application certificate (macOS)  | [Apple](../publishing/apple#_2-developer-id-application-certificate-macos)                  | included in the membership                        | `CSC_LINK`, `CSC_KEY_PASSWORD`, or `CSC_NAME`                                                                                                                      |
| Notarization: App Store Connect API key       | [Apple](../publishing/apple#_3-app-store-connect-api-key-notarization-ios-on-ci)            | included in the membership                        | `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` (or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)                                            |
| Steamworks App ID, depots, builder account    | [Steamworks](../publishing/steam)                                                           | paid, once per app (Steam Direct fee)             | `steam.appId` in `game.config.ts`, `STEAM_USERNAME`                                                                                                                |
| CI: the same values as repository secrets     | [GitHub secrets](../publishing/github-secrets)                                              | free                                              | secrets of the same names (`APPLE_API_KEY_P8` holds the `.p8` contents)                                                                                            |

Linux packages are not signed and need nothing.

## Signing and notarization

Signing is optional and turns on when certificates are in the environment (variable names are electron-builder's):

| OS      | Variables                                                                                                                                                                                                              | Result                                                   |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Windows | `WIN_CSC_LINK` (a .pfx path or base64), `WIN_CSC_KEY_PASSWORD`; or the Azure Trusted Signing variables above                                                                                                           | Installer and executables signed (SHA-256, timestamped). |
| macOS   | `CSC_LINK` + `CSC_KEY_PASSWORD` (Developer ID Application .p12) or `CSC_NAME`; to notarize, `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`, or `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` | Hardened runtime, signed, notarized and stapled.         |
| Linux   | none                                                                                                                                                                                                                   | AppImage and deb are not signed.                         |

```sh
pnpm blacklight sign --dry-run            # what would be signed, with which commands (secrets masked)
pnpm blacklight build --target mac        # signs while packaging when certificates are present
pnpm blacklight build --target win --no-sign
```

`blacklight doctor --target <os>` checks the tools and variables of each target.

## Options of desktop builds

| Flag                | Meaning                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| `--dir`             | Only the unpacked app (`release/<os>/<os>-unpacked`), fast; used by tests. |
| `--arch x64\|arm64` | One architecture (macOS builds both by default, Steam one universal app).  |
| `--no-sign`         | Do not sign even when certificates are present.                            |
| `--dry-run`         | Stage the app and print the signing plan without packaging.                |

A 512×512 (or larger) `icon.png` at the root of the game becomes the app icon on every OS.

## Limits

- Build each OS on that OS (CI runners): V8 bytecode and the SDL binding match the machine that builds them. A cross build still works but leaves both out (the game then reads pads through the Gamepad API) and says so. The x64 macOS package built on an Apple Silicon runner has no bytecode; build it on an Intel runner for that.
- The universal macOS app of the steam target is built on an Apple silicon Mac (an Intel Mac cannot run the arm64 Electron that compiles the arm64 bytecode; there, pass `--arch x64`), with network access the first time: the other architecture's SDL prebuild (cached in `~/Library/Caches/blacklight/`) and Electron (cached by @electron/get) are downloaded, the bytecode of the other architecture is compiled under Rosetta 2 on Apple silicon (`softwareupdate --install-rosetta`), and `lipo` comes with the Xcode command line tools. Native addons of modules must be universal binaries there, or build one architecture with `--arch`. On Apple silicon, the x64 slice of that app (Intel, or a player who picks "Open using Rosetta") starts after Rosetta 2 has translated the Electron framework: the first start waits over a minute, later starts do not; Intel Macs run it natively.
- Gyroscope and accelerometer of controllers are not available: @kmamal/sdl 0.11 does not expose SDL's controller sensors (`gamepad(game, i).hasGyro` is `false`). LEDs, rumble and trigger rumble work.
- Steam leaderboards are not available: steamworks.js 0.4.0 does not expose them (`uploadScore` and `getScores` fail with a message); use the reference server for scores. The Steam overlay may not show in Electron (accepted limitation L3); achievements, Cloud and rich presence work.
- Native addons of modules that use Node's ABI instead of Node-API (better-sqlite3) ship as installed and must be rebuilt for the Electron version (`npx @electron/rebuild`) before packaging; Node-API addons (the SDL binding, steamworks.js) work as is.
- Signing, notarization and the Steam upload need accounts that do not exist during development; they are covered in dry-run mode only (L6) and by the manual checklist.
- Windows certificates whose key sits on a USB token or in a CA's own cloud service (every new publicly trusted OV or EV certificate since June 2023) are not driven by the CLI: build unsigned and sign `release/win/*.exe` with the vendor's tools, or use Azure Trusted Signing, which the CLI drives ([Windows code signing](../publishing/windows#ov-and-ev-certificates)).
- Deep links on Linux work once the scheme is registered: the deb package does it through its `.desktop` entry; an AppImage needs an AppImage launcher (or `xdg-mime`) to register it.
