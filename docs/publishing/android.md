# Android: upload key and Play App Signing

_Checked 2026-11. Google Play policies and fees change; the links at the end are the reference._

Android only installs signed apps. Debug builds use the SDK's debug key, which no store accepts; release builds are signed with a key you create, and the engine reads it from the environment. Without it, `blacklight build --target android --release` makes an unsigned APK and says so.

| Credential                    | Cost                                                         | Environment variable / secret                                                                |
| ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Upload keystore (`.jks`)      | free (`keytool` comes with the JDK)                          | `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| Google Play developer account | one-time registration fee (25 USD), see Google's current fee | none (Play Console)                                                                          |

Prerequisites: JDK 21 (the one the Android build uses; `blacklight doctor --target android` finds it), and for Google Play a Google account and identity documents for the account verification.

## 1. Create the upload key

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` asks for a keystore password, your name and organization (written into the certificate), and a key password (press Enter to reuse the keystore password). `-validity 10000` is about 27 years; Google Play requires a key valid past 2033.

Create it outside the game folder, so it never reaches the repository, and keep it and its passwords in a password manager or a backup you control. Every update of the app must be signed with a key Google recognizes.

| Variable                    | Value                                            |
| --------------------------- | ------------------------------------------------ |
| `ANDROID_KEYSTORE`          | path to `upload.jks`                             |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password                                |
| `ANDROID_KEY_ALIAS`         | `upload` (the `-alias`)                          |
| `ANDROID_KEY_PASSWORD`      | key password (defaults to the keystore password) |

```sh
ANDROID_KEYSTORE=$HOME/keys/upload.jks ANDROID_KEYSTORE_PASSWORD=… ANDROID_KEY_ALIAS=upload \
  pnpm blacklight build --target android --aab       # release/android/<name>-<version>.aab for Google Play
pnpm blacklight build --target android --release     # signed APK, for other stores or direct download
```

The Gradle build reads the variables directly; nothing is written to disk. For CI, store the keystore in base64 (`base64 -w0 upload.jks` on Linux, `base64 -i upload.jks` on macOS) in the `ANDROID_KEYSTORE_BASE64` secret; the template workflow decodes it to a temporary file ([GitHub secrets](./github-secrets)).

## 2. Play App Signing

Google Play signs the APKs it delivers to devices with an **app signing key** that Google keeps; you sign what you upload with your **upload key**. Play App Signing is mandatory for new apps, and new apps are uploaded as Android App Bundles (`.aab`), which is what `--aab` builds.

1. Create the developer account at [play.google.com/console](https://play.google.com/console/signup) (personal or organization), pay the one-time fee and complete identity verification. New personal accounts must run a closed test with a minimum number of testers for a minimum number of days before they can publish to production; the Play Console shows the current numbers.
2. **Create app**: name, default language, game, free or paid.
3. **Test and release** → **Testing** → **Internal testing** → **Create new release**. On the first release Play offers to let Google generate and protect the app signing key: accept. Upload the `.aab`; the upload key that signed it is now registered.
4. Fill the store listing, content rating, data safety and target audience forms, then promote the release to closed, open or production testing.

What you get: if the upload key is lost or leaks, the account owner can ask for an upload key reset in **Setup** → **App signing**, because the key that devices trust stays with Google. The SHA-256 fingerprints shown on that page are the ones to give services that check the app's signature (Play Games Services uses them for the OAuth client).

## Limits

- The engine does not upload to the Play Console; upload the `.aab` there (or with Google's publishing API from your own tooling).
- An APK signed with the upload key is not what Play delivers; for direct downloads it is the final signature, so use one key per distribution channel on purpose.
- Losing the upload key of an app that is not on Google Play (direct download, other stores) means players must uninstall to update: there is no reset outside Play.

## Official documentation

- [Sign your app](https://developer.android.com/studio/publish/app-signing) (upload key, Play App Signing, `keytool`)
- [Android App Bundles](https://developer.android.com/guide/app-bundle)
- [Play Console Help](https://support.google.com/googleplay/android-developer/)
