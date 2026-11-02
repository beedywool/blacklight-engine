# Windows code signing

_Checked 2026-11. Certificate prices, Azure eligibility and SmartScreen behaviour change; the links at the end are the reference._

A signed installer tells Windows who published it and proves it was not modified since. The certificate is yours: the engine reads it from the environment and, without one, builds an unsigned installer and says so (`Windows: unsigned …`). Two ways work with `blacklight build --target win`:

| Way                            | Cost                                          | Who can get it                                      | Environment variables / secrets                                                                                                                                    |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Azure Trusted Signing          | monthly subscription, see Microsoft's pricing | organizations and individuals in eligible countries | `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, `AZURE_SIGNING_PUBLISHER`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |
| A certificate in a `.pfx` file | free (self-signed) to a yearly fee            | anyone                                              | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                                                                                                                             |

When both are set, the `.pfx` wins. `blacklight sign --dry-run --target win` prints which way will be used and the commands, secrets masked.

## What SmartScreen does

Microsoft Defender SmartScreen checks programs downloaded from the internet (files carrying the "mark of the web") against a reputation that Microsoft builds from how many people ran the file and the certificate that signed it. A file with no reputation shows **Windows protected your PC**; the player must click **More info** → **Run anyway**. Signing does not remove the warning on the first day: it lets the reputation accumulate on your certificate across versions, instead of starting from zero with each new unsigned file. An unsigned game also shows "Unknown publisher" in the UAC prompt of the installer.

Games installed by Steam are not downloaded by the browser and do not carry the mark of the web, so Steam players do not see SmartScreen. Signing still matters there for antivirus heuristics and for players who check the publisher.

## OV and EV certificates

Certificate authorities (DigiCert, Sectigo, GlobalSign, SSL.com and others) sell two kinds of publicly trusted code signing certificates:

- **OV** (organization validation): the CA checks that the organization (or, at some CAs, the individual) exists. Typically a few hundred US dollars per year; see the CA's current pricing.
- **EV** (extended validation): stricter checks, organizations only, more expensive. EV certificates used to get SmartScreen reputation immediately; Microsoft has since stated that EV no longer skips reputation building, so for a game the extra cost buys little.

Since June 2023 the CA/Browser Forum rules require the private key of every new OV and EV code signing certificate to live in a hardware security module: a USB token the CA mails you, your own HSM, or the CA's cloud signing service. **The key can no longer be exported to a `.pfx` file**, which is what `WIN_CSC_LINK` expects. So with a new OV or EV certificate:

- build unsigned, then sign `release/win/*.exe` with the CA's tool or `signtool` and the token, on the machine that holds it (SHA-256, RFC 3161 timestamp);
- or use Azure Trusted Signing below, which the engine drives directly.

A `.pfx` still works for certificates issued before that change (until they expire), for a company's internal CA, and for a self-signed certificate made for testing.

## Azure Trusted Signing (cheapest trusted option)

Microsoft's signing service holds the keys, issues short-lived certificates in your verified name, and timestamps each signature, so signed files stay valid after the certificate expires. It is billed monthly (a Basic tier with a monthly signature quota and a Premium tier; see Microsoft's current pricing). Eligibility is limited: organizations with a few years of verifiable history in supported countries, and individual developers in a smaller set of countries; check Microsoft's page before you start. Microsoft has been renaming the service, so the portal may show a newer name for the same resources.

Prerequisites: an Azure account with a subscription (pay-as-you-go), and the legal documents for identity validation.

1. In the Azure portal, register the **Microsoft.CodeSigning** resource provider for the subscription (**Subscriptions** → your subscription → **Resource providers**).
2. Create a **Trusted Signing account**. Pick a region; its endpoint is the `AZURE_SIGNING_ENDPOINT` (for example `https://eus.codesigning.azure.net` for East US). The account name is `AZURE_SIGNING_ACCOUNT`.
3. Give yourself the **Trusted Signing Identity Verifier** role on the account, then open **Identity validations** → **New** → **Public**, and fill the organization (or individual) details. Microsoft checks them; this takes from hours to several business days.
4. When the validation is complete, create a **Certificate profile** of type **Public Trust** with that validation. Its name is `AZURE_SIGNING_PROFILE`. The subject common name (CN) it shows, usually your legal name, is `AZURE_SIGNING_PUBLISHER`, written exactly.
5. In **Microsoft Entra ID** → **App registrations** → **New registration**, create an app (`game-signing`), then **Certificates & secrets** → **New client secret**. Note the **Directory (tenant) ID** (`AZURE_TENANT_ID`), **Application (client) ID** (`AZURE_CLIENT_ID`) and the secret value (`AZURE_CLIENT_SECRET`, shown once).
6. On the Trusted Signing account (or only the certificate profile), **Access control (IAM)** → **Add role assignment** → **Trusted Signing Certificate Profile Signer** → the app from step 5.

```sh
export AZURE_SIGNING_ENDPOINT=https://eus.codesigning.azure.net
export AZURE_SIGNING_ACCOUNT=my-studio AZURE_SIGNING_PROFILE=public AZURE_SIGNING_PUBLISHER="My Studio Ltd"
export AZURE_TENANT_ID=… AZURE_CLIENT_ID=… AZURE_CLIENT_SECRET=…
pnpm blacklight sign --dry-run --target win
pnpm blacklight build --target win     # on Windows: electron-builder signs through Trusted Signing
```

The signing runs on Windows (electron-builder calls Microsoft's `TrustedSigning` PowerShell module, which it installs on first use). Client secrets expire (at most two years in Entra ID): renew `AZURE_CLIENT_SECRET` before that date.

## A .pfx file

```sh
pnpm blacklight build --target win     # with WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD set
```

| Variable               | Value                                                |
| ---------------------- | ---------------------------------------------------- |
| `WIN_CSC_LINK`         | path to the `.pfx`, or the file in base64 (one line) |
| `WIN_CSC_KEY_PASSWORD` | the `.pfx` password                                  |

A self-signed certificate costs nothing and is useful to test the signing pipeline; players still see "Unknown publisher" and SmartScreen, because no public authority vouches for it. In PowerShell:

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=My Studio" -CertStoreLocation Cert:\CurrentUser\My
Export-PfxCertificate -Cert $cert -FilePath test-signing.pfx -Password (Read-Host -AsSecureString "Password")
[Convert]::ToBase64String([IO.File]::ReadAllBytes("test-signing.pfx")) | Set-Clipboard
```

## Limits

- Certificates on a USB token or in a CA's own cloud service (other than Azure Trusted Signing) are not driven by the CLI: sign the files in `release/win/` after the build with the vendor's tools.
- The NSIS installer and the portable executable are signed; there is no Microsoft Store (MSIX) target.
- Azure Trusted Signing signs on Windows only, so the Windows build must run on Windows (the template workflow does).

## Official documentation

- [Trusted Signing (Azure)](https://learn.microsoft.com/azure/trusted-signing/) and its [pricing](https://azure.microsoft.com/pricing/details/trusted-signing/)
- [Microsoft Defender SmartScreen](https://learn.microsoft.com/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/)
- [SignTool](https://learn.microsoft.com/windows/win32/seccrypto/signtool)
- [CA/Browser Forum code signing requirements](https://cabforum.org/working-groups/code-signing/)
