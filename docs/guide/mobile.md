# Android and iOS

A game becomes an Android or iOS app with one command. The CLI builds the web version, embeds it in a Capacitor project it generates, and runs Gradle or Xcode. The game code does not change: `game.platform` becomes the mobile platform (files in app-private storage, the save key in the Android Keystore or iOS Keychain, native modules), the Android back button presses the `back` action, and the game pauses while the app is in the background.

```sh
blacklight build --target android            # debug APK, installable on any device
blacklight build --target android --release  # release APK, signed when a keystore is set
blacklight build --target android --aab      # Android App Bundle for Google Play
blacklight build --target ios                # iOS Simulator app (macOS only)
blacklight build --target ios --release      # signed .ipa for App Store Connect (macOS only)
```

Outputs land in `release/android/` and `release/ios/` (`<name>-<version>-debug.apk`, `<name>-<version>.apk`, `.aab`, `.app`, `.ipa`). The assets are inside the app: it starts and runs with no network.

## Requirements

| Target  | Needs                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Android | Android SDK (Android Studio or the command-line tools) and JDK 21 to 24. Linux, macOS or Windows.                          |
| iOS     | macOS with the Xcode that Capacitor 8 supports (Xcode 26). Other systems generate the Xcode project but cannot compile it. |

The CLI finds the SDK through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, then the default Android Studio folder (`~/Android/Sdk`, `~/Library/Android/sdk`, `%LOCALAPPDATA%\Android\Sdk`). It uses `JAVA_HOME` when set, otherwise the `java` on the `PATH` if it is version 21 to 24, otherwise Android Studio's bundled JDK (`jbr`) or an installed JDK 21. The first Android build downloads Gradle 8.14 and the Android libraries (about 1 GB in `~/.gradle`); later builds take seconds.

## Flags

| Flag            | Targets      | Meaning                                                                                      |
| --------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `--release`     | android, ios | Release build: no WebView inspection, no native logs, signed when signing is configured.     |
| `--aab`         | android      | Android App Bundle instead of an APK (implies `--release`).                                  |
| `--run`         | android, ios | Install and start the build on a device or emulator (Android) or the booted Simulator (iOS). |
| `--device <id>` | android, ios | Device serial from `adb devices`, or simulator id from `xcrun simctl list`.                  |
| `--sqlite`      | android, ios | Include native SQLite even when no dependency asks for it.                                   |
| `--dry-run`     | android, ios | Generate and sync the native project, print the Gradle or Xcode command, build nothing.      |

```sh
blacklight build --target android --run --device emulator-5554
blacklight run --target android --device emulator-5554   # same: debug build, install, start
blacklight doctor --target android                        # JDK, SDK, keystore variables
```

## Configuration

The `mobile` section of `game.config.ts` drives the native project and the runtime.

```ts
export default defineConfig({
  name: 'My Game',
  id: 'com.example.mygame',
  version: '1.4.0',
  entry: 'title',
  resolution: { width: 1920, height: 1080 },
  mobile: { orientation: 'landscape', statusBar: 'hidden', keepAwake: true },
});
```

| Option           | Default                                           | Meaning                                                                                                          |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `orientation`    | `landscape` when wider than tall, else `portrait` | `landscape`, `portrait` (both locked, either way up) or `any`. Written to the manifest and `Info.plist`.         |
| `statusBar`      | `'hidden'`                                        | `'hidden'` hides the status bar and the Android navigation bar (a swipe shows them for a moment).                |
| `keepAwake`      | `true`                                            | Keep the screen on while the game is in the foreground.                                                          |
| `playGamesAppId` | none                                              | Google Play Games Services project id (Play Console → Play Games Services → Configuration). Enables `playgames`. |
| `gameCenter`     | `false`                                           | Adds the Game Center capability to the iOS project. Enables `gamecenter`.                                        |

The other fields come from the top level: `id` is the application id and bundle identifier (it cannot change after the first store upload), `name` is the name under the icon, `version` is the visible version. Android's `versionCode` and iOS's build number are derived from it: `major × 1 000 000 + minor × 1 000 + patch`, so `1.4.0` is `1004000` and every release sorts above the previous one.

## The native project

The CLI generates the Capacitor project in `.blacklight/mobile/` (git-ignored) the first time, then syncs it on every build: web files, plugins, `capacitor.config.json`, and the settings above. It is a regular Android Studio / Xcode project:

```sh
blacklight build --target android --dry-run
studio .blacklight/mobile/android          # or: open .blacklight/mobile/ios/App/App.xcodeproj
```

Changes made there are overwritten by the next build where the CLI manages the file, and lost when `.blacklight/` is deleted. Native files of your own (icons, splash screens, extra manifest entries, `google-services.json`) go in `mobile/android/` and `mobile/ios/` at the root of the game, with the same layout as the generated project: every build copies them over it.

```
mobile/
  android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
  ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
```

The web bundle of a mobile build is the web build plus `@blacklight/mobile`; games do not import or install it. A game that calls the mobile API directly (`import { MobilePlatform } from '@blacklight/mobile'`) adds the package to its dependencies.

## Platform

`game.platform` is a `MobilePlatform` in the app and the web platform in a browser, so the same code runs in both.

| Member         | On Android and iOS                                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | `'android'` or `'ios'`.                                                                                                                                                                                                                       |
| `files`        | Files under `blacklight/` in app-private storage (Android `files/`, iOS Documents). Writes go to a temporary file renamed over the old one; a write cut short by a crash is finished on the next read. `files.location` is the native folder. |
| `saveKey()`    | AES-256-GCM key, created on first use with 32 random bytes kept by the Android Keystore or the iOS Keychain, imported as a non-extractable `CryptoKey`. Uninstalling the app deletes it.                                                      |
| `invoke()`     | Native modules (below).                                                                                                                                                                                                                       |
| `on(event)`    | `back`, `pause`, `resume`, `deeplink` (`{ url }`).                                                                                                                                                                                            |
| `openUrl(url)` | Opens an `http(s)` link in the in-app browser (Custom Tabs, Safari View Controller).                                                                                                                                                          |
| `quit()`       | Closes the app on Android; does nothing on iOS (Apple rejects apps that close themselves).                                                                                                                                                    |

## Lifecycle and input

- **Back button.** The Android back button and back gesture press the `back` action of player 1 for one step, whatever its bindings, and raise the `back` platform event. The app does not close by itself: the title screen decides, for example with a confirmation and `game.platform.quit()`.
- **Background.** When the app leaves the foreground the loop stops, held inputs are released and the audio is suspended, as for a hidden browser tab (`pauseOnBlur`). `pause` and `resume` platform events fire too: save there.
- **Deep links.** The app opens links with its id as scheme (`com.example.mygame://…`; the accounts module's redirect URI is `com.example.mygame:/oauth/callback`). Each one raises `deeplink`; the link that launched the app is kept until the first listener subscribes.
- **Touch.** Touch input is the same as in a mobile browser (`Touch` binding, `input.pointer`, `input.touches`, UI taps).
- **Safe areas.** `game.safeArea` excludes notches and rounded corners; the generated page uses `viewport-fit=cover` and the WebView reports the insets.

```ts
override create() {
  this.game.platform.on('pause', () => this.save());
}

override update() {
  if (this.input.pressed('back')) this.ui.push('QuitConfirm');
}
```

## Native modules

`platform.invoke(module, method, ...args)` reaches native code. Arguments are checked before they cross to the native side; wrong ones throw with the expected form.

| Module           | Methods                                                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `haptics`        | `impact(style = 'medium')` with `light`, `medium`, `heavy`; `notification(type)` with `success`, `warning`, `error`; `vibrate(ms = 300)`; `selection()`.                                                                                                                                                       |
| `app`            | `info()` → `{ id, name, version, build }`; `exit()`; `minimize()` (Android); `orientation('landscape' \| 'portrait' \| 'any')`; `keepAwake(on)`; `statusBar(visible)`; `launchUrl()`.                                                                                                                          |
| `secure-storage` | `get(key)` → string or `null`; `set(key, value)`; `remove(key)`; `keys()`. Strings encrypted by the Keystore or kept in the Keychain. Keys starting with `blacklight.` are reserved.                                                                                                                           |
| `sqlite`         | `open(database)`; `execute(database, sql, params?)` → `{ changes, lastInsertId }`; `query(database, sql, params?)` → rows; `close(database)`. Database names are file names (`game.db`); parameters are strings, numbers, booleans (stored as 1 / 0), `null` or `Uint8Array`; blobs come back as `Uint8Array`. |
| `playgames`      | Android. `unlock(id)`; `submitScore(board, score)`; `scores(board, limit = 10)` → `[{ rank, name, score }]` (all-time public top, 25 at most); `signIn()` → `{ authenticated, playerId?, displayName? }`; `progress(id, current, total)`; `show()`. Calls that need a player show the sign-in first.           |
| `gamecenter`     | iOS. Same methods as `playgames`.                                                                                                                                                                                                                                                                              |

```ts
await this.game.platform.invoke('haptics', 'impact', 'heavy');
await this.game.platform.invoke('secure-storage', 'set', 'refreshToken', token);
const rows = await this.game.platform.invoke(
  'sqlite',
  'query',
  'game.db',
  'SELECT * FROM scores WHERE points > ?',
  [100],
);
```

The `sqlite` and `achievements` modules call these for you; use them rather than `invoke` in game code. Native SQLite (`@capacitor-community/sqlite`) is only in builds that need it: when the game depends on a package whose name ends in `sqlite`, when `game.config.ts` configures a `sqlite` module, or with `--sqlite`.

Any other module name goes to a Capacitor plugin of that name in the app, called as `plugin[method]({ args })` and answered with `{ value }`; Capacitor plugins listed in the game's dependencies are included in the build. JavaScript-only modules register with `platform.register(name, methods)`.

### Achievements

`playgames` needs `mobile.playGamesAppId` and the game set up in the Play Console with its achievements; the SDK starts only then, and the first `signIn()` shows Google's sign-in when the player is not signed in already. `progress` sets the steps of an incremental achievement to `current` (the total is the one set in the Play Console). `gamecenter` needs `mobile.gameCenter: true` and the achievements set up in App Store Connect; `progress` reports `current / total` as a percentage. Both reject with an explanation on the other OS.

## What you need to provide

Signing keys and store accounts always come from you, the game developer; the engine ships none and never refers to anyone else's. Without them, Android builds a debug APK (or an unsigned release APK, with a message) and iOS builds for the Simulator.

| Credential                                      | Where to get it                                                                          | Paid or free                    | Environment variable                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| Android upload keystore                         | [Android](../publishing/android#_1-create-the-upload-key) (`keytool`)                    | free                            | `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| Google Play developer account, Play App Signing | [Android](../publishing/android#_2-play-app-signing)                                     | paid, one-time registration fee | none (Play Console)                                                                          |
| Apple Developer Program membership              | [Apple](../publishing/apple#_1-enroll-in-the-apple-developer-program)                    | paid, yearly                    | `APPLE_TEAM_ID`                                                                              |
| Apple Distribution certificate                  | [Apple](../publishing/apple#_4-ios-app-id-distribution-certificate-provisioning-profile) | included in the membership      | in the login keychain (CI: `IOS_DIST_CERT_P12`, `IOS_DIST_CERT_PASSWORD` secrets)            |
| Provisioning profile                            | created by Xcode (automatic signing)                                                     | included in the membership      | none                                                                                         |
| App Store Connect API key (CI only)             | [Apple](../publishing/apple#_3-app-store-connect-api-key-notarization-ios-on-ci)         | included in the membership      | `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`                                      |
| CI: the same values as repository secrets       | [GitHub secrets](../publishing/github-secrets)                                           | free                            | secrets of the same names (`ANDROID_KEYSTORE_BASE64` holds the keystore)                     |

## Signing

Android release builds are signed when these environment variables are set; nothing is written to disk.

| Variable                    | Meaning                                           |
| --------------------------- | ------------------------------------------------- |
| `ANDROID_KEYSTORE`          | Path to the `.jks` / `.keystore` file.            |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password.                                |
| `ANDROID_KEY_ALIAS`         | Key alias.                                        |
| `ANDROID_KEY_PASSWORD`      | Key password (defaults to the keystore password). |

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Without them the release APK is unsigned (the CLI says so) and stores refuse it. Debug builds use the SDK's debug key. iOS release builds archive and export an `.ipa` for App Store Connect with automatic signing for the team in `APPLE_TEAM_ID`; the Apple Distribution certificate must be in the login keychain, and Xcode fetches the provisioning profile with the Apple account added in Xcode → Settings → Accounts, or with the App Store Connect API key when `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set (CI runners).

## Release builds

Release builds turn off WebView inspection (Chrome's `chrome://inspect`, Safari's Web Inspector) and native console logging, and leave out the debug overlay. Debug builds keep them on so `chrome://inspect` can attach to the game on a device.

## Limits

- iOS apps can only be compiled on macOS; on Linux and Windows `--target ios` stops after generating the Xcode project (`--dry-run` makes that the goal). The template's GitHub Actions workflow builds iOS on a macOS runner.
- Native SQLite adds several megabytes per CPU architecture to the APK, which is why it is only included on demand.
- Play Games Services needs Google Play services on the device; on devices without them `playgames` rejects.
- App icons and splash screens are Capacitor's defaults until you put yours in `mobile/android/` and `mobile/ios/`; the CLI does not resize images.
- Game Center and Play Games cannot be tested in CI (they need store accounts); they are on the manual checklist, as are real phones.
- The generated project in `.blacklight/mobile/` is not meant to be edited: use the `mobile/` overlay for native changes that must survive.
