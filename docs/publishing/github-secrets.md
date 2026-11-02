# GitHub secrets for the build workflow

_Checked 2026-11._

Every game made with `pnpm create blacklight` has `.github/workflows/build.yml`, which builds web, Windows, macOS, Linux, Android and iOS on each push. It signs only with credentials you store as repository secrets. A job whose secrets are missing still succeeds: it builds unsigned (or a debug APK, or the iOS Simulator app) and adds a notice to the run summary naming the secrets it needs. Nothing in the workflow or the engine holds a credential of its own.

Cost: secrets are free on GitHub. Running the workflow uses GitHub Actions minutes; macOS runners count for more minutes than Linux ones on private repositories, see GitHub's current billing.

## Add a secret

1. On GitHub, open the repository → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**, enter the exact name from the table below and the value, **Add secret**.
3. Run the workflow again (**Actions** → **Build** → **Run workflow**) and read the notices in the run summary.

Files (certificates, keystores) go in as base64 on one line:

```sh
base64 -w0 file.p12          # Linux
base64 -i file.p12 | pbcopy  # macOS, copies it
```

With the GitHub CLI, from the game folder:

```sh
gh secret set WIN_CSC_KEY_PASSWORD                       # prompts for the value
base64 -w0 developer-id.p12 | gh secret set CSC_LINK     # from a file
gh secret set APPLE_API_KEY_P8 < AuthKey_ABC123XYZ.p8    # the .p8 as text, not base64
```

Secrets are not passed to workflows triggered by pull requests from forks: those runs build unsigned, which is intended.

## The secrets

| Secret                        | Job        | Value                                         | Guide                                                                        |
| ----------------------------- | ---------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| `WIN_CSC_LINK`                | Windows    | code signing `.pfx`, base64                   | [Windows](./windows#a-pfx-file)                                              |
| `WIN_CSC_KEY_PASSWORD`        | Windows    | its password                                  | [Windows](./windows#a-pfx-file)                                              |
| `AZURE_SIGNING_ENDPOINT`      | Windows    | Trusted Signing endpoint, instead of a `.pfx` | [Windows](./windows#azure-trusted-signing-cheapest-trusted-option)           |
| `AZURE_SIGNING_ACCOUNT`       | Windows    | Trusted Signing account name                  | same                                                                         |
| `AZURE_SIGNING_PROFILE`       | Windows    | certificate profile name                      | same                                                                         |
| `AZURE_SIGNING_PUBLISHER`     | Windows    | publisher (CN) of the profile, exactly        | same                                                                         |
| `AZURE_TENANT_ID`             | Windows    | Entra tenant id of the signing app            | same                                                                         |
| `AZURE_CLIENT_ID`             | Windows    | its application (client) id                   | same                                                                         |
| `AZURE_CLIENT_SECRET`         | Windows    | its client secret                             | same                                                                         |
| `CSC_LINK`                    | macOS      | Developer ID Application `.p12`, base64       | [Apple](./apple#_2-developer-id-application-certificate-macos)               |
| `CSC_KEY_PASSWORD`            | macOS      | its password                                  | same                                                                         |
| `APPLE_API_KEY_P8`            | macOS, iOS | contents of `AuthKey_<key id>.p8`             | [Apple](./apple#_3-app-store-connect-api-key-notarization-ios-on-ci)         |
| `APPLE_API_KEY_ID`            | macOS, iOS | the Key ID                                    | same                                                                         |
| `APPLE_API_ISSUER`            | macOS, iOS | the Issuer ID                                 | same                                                                         |
| `APPLE_ID`                    | macOS      | instead of the API key: Apple ID e-mail       | same                                                                         |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS      | instead of the API key: app-specific password | same                                                                         |
| `APPLE_TEAM_ID`               | macOS, iOS | 10-character team id                          | [Apple](./apple#_1-enroll-in-the-apple-developer-program)                    |
| `IOS_DIST_CERT_P12`           | iOS        | Apple Distribution `.p12`, base64             | [Apple](./apple#_4-ios-app-id-distribution-certificate-provisioning-profile) |
| `IOS_DIST_CERT_PASSWORD`      | iOS        | its password                                  | same                                                                         |
| `ANDROID_KEYSTORE_BASE64`     | Android    | upload keystore `.jks`, base64                | [Android](./android#_1-create-the-upload-key)                                |
| `ANDROID_KEYSTORE_PASSWORD`   | Android    | keystore password                             | same                                                                         |
| `ANDROID_KEY_ALIAS`           | Android    | key alias                                     | same                                                                         |
| `ANDROID_KEY_PASSWORD`        | Android    | key password                                  | same                                                                         |

What each job does with them:

- **desktop (Windows)**: signs the installer and portable executable with the `.pfx`, or else with Azure Trusted Signing. Only the Windows job receives these secrets.
- **desktop (macOS)**: signs with the Developer ID certificate, then notarizes with the API key (or the Apple ID set) and staples. Only the macOS job receives these secrets.
- **android**: with the keystore, builds a signed release APK and an App Bundle for Google Play; without it, a debug APK.
- **ios**: always builds the Simulator app; with the team, the distribution certificate and the API key, it also imports the certificate into a temporary keychain and builds a signed `.ipa` for App Store Connect.
- **web** and **Linux** need no secret.

Steam uploads are not in the workflow ([Steamworks](./steam#limits)).

## Limits

- The workflow builds and keeps the files as run artifacts; it does not publish to any store.
- A secret's value cannot be read back from GitHub; keep the originals (`.p12`, `.p8`, `.jks`, passwords) in your own password manager.
- Environment secrets and organization secrets work too, but the workflow reads them by the same names.

## Official documentation

- [Using secrets in GitHub Actions](https://docs.github.com/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
- [`gh secret set`](https://cli.github.com/manual/gh_secret_set)
- [About billing for GitHub Actions](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions)
