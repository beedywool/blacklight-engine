# Apple: macOS and iOS

_Checked 2026-11. Apple changes its portals and prices; the links at the end are the reference._

Every Apple credential the engine uses belongs to your own Apple developer account. The engine never ships one: without them `blacklight build --target mac` makes an unsigned app that Gatekeeper blocks until the player allows it, and `--target ios` builds for the Simulator only. This guide gets you, in order, the membership, the Developer ID certificate that signs the macOS app, the App Store Connect API key that notarizes it, and the distribution certificate that signs the iOS app.

| Credential                      | Cost                          | Needed for                                  | Environment variable / secret                                        |
| ------------------------------- | ----------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| Apple Developer Program         | yearly fee (99 USD in the US) | everything below                            | `APPLE_TEAM_ID`                                                      |
| Developer ID Application (.p12) | included                      | signing the macOS app outside the App Store | `CSC_LINK`, `CSC_KEY_PASSWORD` (or `CSC_NAME` on your own Mac)       |
| App Store Connect API key (.p8) | included                      | notarization; iOS signing on a CI runner    | `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`              |
| Apple Distribution certificate  | included                      | iOS App Store builds                        | in the keychain; `IOS_DIST_CERT_P12`, `IOS_DIST_CERT_PASSWORD` in CI |
| Provisioning profile            | included                      | iOS App Store builds                        | none: Xcode creates it (automatic signing)                           |

## Prerequisites

- A Mac with Xcode for anything iOS, and for exporting certificates. macOS builds can be signed on the macOS runner of GitHub Actions; the iOS build always runs on macOS.
- An Apple Account with two-factor authentication turned on.
- For an organization: a D-U-N-S Number for the legal entity (free from Dun & Bradstreet, takes a few days) and the authority to bind it to Apple's agreements. An individual enrolls under their own legal name, which is the seller name players see.

## 1. Enroll in the Apple Developer Program

1. Go to [developer.apple.com/programs](https://developer.apple.com/programs/) and choose **Enroll**, or use the Apple Developer app on an iPhone, iPad or Mac (identity checks are faster there).
2. Pick individual or organization, fill the legal details, pay the yearly fee. The price is 99 USD per year in the US; other regions pay a local price, see Apple's current pricing. Some nonprofits, schools and government entities can ask for a fee waiver.
3. Wait for the confirmation mail. Individuals are usually accepted within a day or two; organizations can take longer while Apple checks the D-U-N-S record.
4. Open [developer.apple.com/account](https://developer.apple.com/account) → **Membership details** and copy the **Team ID** (10 characters). That is `APPLE_TEAM_ID`.

What you get: the right to sign and notarize Mac apps distributed outside the Mac App Store, to publish on the App Store and TestFlight, Game Center, and the certificates below.

## 2. Developer ID Application certificate (macOS)

Only the **Account Holder** (the person who enrolled) can create Developer ID certificates. Apple limits how many an account can hold, and they are valid for several years: keep the exported file and its password with your other secrets rather than creating a new one per machine.

1. On the Mac, open **Keychain Access** → **Keychain Access** menu → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**. Enter your e-mail and name, choose **Saved to disk**. This writes a `.certSigningRequest` file and keeps the private key in your login keychain.
2. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list) choose **+**, then **Developer ID Application**, then the current profile type (G2 Sub-CA), and upload the request file.
3. Download the `.cer` and double-click it: Keychain Access shows it under **My Certificates** as `Developer ID Application: <name> (<team id>)`, with the private key under it.
4. Select the certificate (not the key alone), **File** → **Export Items**, format **Personal Information Exchange (.p12)**, and set a strong password.

On your own Mac the certificate is already in the keychain: `CSC_NAME="Developer ID Application: <name> (<team id>)"` is enough. For CI, turn the `.p12` into one line of base64:

```sh
base64 -i developer-id.p12 | pbcopy      # macOS: copies it for the CSC_LINK secret
base64 -w0 developer-id.p12              # Linux
```

| Variable           | Value                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `CSC_LINK`         | path to the `.p12`, or its base64                                     |
| `CSC_KEY_PASSWORD` | the export password                                                   |
| `CSC_NAME`         | instead of the two above, on a Mac: the identity name in the keychain |

The engine signs with the hardened runtime and the entitlements Electron needs (JIT for V8); `blacklight sign --dry-run --target mac` prints the `codesign` commands it will run.

## 3. App Store Connect API key (notarization, iOS on CI)

Notarization is free: Apple scans the signed app and returns a ticket that the build staples to it, so Gatekeeper opens it without a warning even offline. The engine notarizes when one of two credential sets is present; the API key is the one to prefer, since it is not tied to a person's password and works for iOS signing in CI too.

1. The Account Holder opens [App Store Connect](https://appstoreconnect.apple.com) → **Users and Access** → **Integrations** → **App Store Connect API**, and requests API access once for the team.
2. Under **Team Keys**, choose **+** (Generate API Key), give it a name (`ci-signing`) and a role. **Developer** is enough for notarization. For the iOS build in CI, where Xcode must create provisioning profiles, give it **Admin**; see Apple's role table if your team restricts roles.
3. Download the key: a file `AuthKey_<key id>.p8`. Apple lets you download it **once**; store it with your other secrets.
4. Copy the **Key ID** (next to the key) and the **Issuer ID** (above the list).

| Variable           | Value                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `APPLE_API_KEY`    | path to `AuthKey_<key id>.p8` (in CI, the `APPLE_API_KEY_P8` secret holds its contents and the workflow writes the file) |
| `APPLE_API_KEY_ID` | the Key ID                                                                                                               |
| `APPLE_API_ISSUER` | the Issuer ID (a UUID)                                                                                                   |

The alternative is your Apple ID: `APPLE_ID` (the account e-mail), `APPLE_APP_SPECIFIC_PASSWORD` (created at [account.apple.com](https://account.apple.com) → **Sign-In and Security** → **App-Specific Passwords**) and `APPLE_TEAM_ID`.

```sh
pnpm blacklight sign --dry-run --target mac   # shows codesign, notarytool and stapler steps
pnpm blacklight build --target mac            # signs, notarizes and staples
spctl --assess --type execute -vv "path/to/My Game.app"   # "source=Notarized Developer ID"
```

Notarization takes from a minute to (rarely) hours; `notarytool` waits for the answer.

## 4. iOS: App ID, distribution certificate, provisioning profile

The engine archives iOS release builds with Xcode's automatic signing for `APPLE_TEAM_ID`. Automatic signing needs an **Apple Distribution** certificate in the keychain and an account Xcode can use to fetch the provisioning profile: the Apple account added in Xcode on your Mac, or the API key of step 3 on a CI runner.

1. **App ID.** In [Identifiers](https://developer.apple.com/account/resources/identifiers/list) choose **+** → **App IDs** → **App**, enter a description and the explicit bundle ID, which is `id` in `game.config.ts` (`com.example.mygame`). Turn on **Game Center** if the game uses the `gamecenter` achievements. Xcode can also register it on the first automatic signing.
2. **Apple Distribution certificate.** On your Mac: Xcode → **Settings** → **Accounts**, add the Apple account, select the team → **Manage Certificates** → **+** → **Apple Distribution**. (Or create it in the Certificates page with a request file, as in step 2.) Export it from Keychain Access as a `.p12` for CI, the same way as the Developer ID certificate.
3. **Provisioning profile.** With automatic signing nothing is to be done: Xcode creates and renews an App Store profile for the App ID and certificate. If you sign manually outside the engine, create one in [Profiles](https://developer.apple.com/account/resources/profiles/list) → **+** → **App Store Connect**, pick the App ID and the certificate, download the `.mobileprovision` and double-click it.
4. **App record.** In App Store Connect → **Apps** → **+** → **New App**, choose iOS, the bundle ID, a name and a SKU.

```sh
APPLE_TEAM_ID=ABCDE12345 pnpm blacklight build --target ios --release   # release/ios/<name>.ipa
```

Upload the `.ipa` with Apple's **Transporter** app (free on the Mac App Store), then send it to TestFlight or to review from App Store Connect. In CI the template workflow builds the signed `.ipa` when `APPLE_TEAM_ID`, `IOS_DIST_CERT_P12`, `IOS_DIST_CERT_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` are set ([GitHub secrets](./github-secrets)); it does not upload.

## Limits

- The Mac App Store is not a target: the macOS build is a Developer ID app (dmg and zip). Mac App Store sandboxing and its certificates are not handled.
- iOS release builds use automatic signing only; a manual provisioning profile is not passed to Xcode by the CLI.
- The engine does not upload to App Store Connect or TestFlight.
- Prices, roles and portal menus are Apple's and change; when this page and Apple disagree, Apple is right.

## Official documentation

- [Apple Developer Program](https://developer.apple.com/programs/) and [account help](https://developer.apple.com/help/account/)
- [Developer ID](https://developer.apple.com/developer-id/)
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Creating API keys for App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api)
- [App Store Connect help](https://developer.apple.com/help/app-store-connect/)
