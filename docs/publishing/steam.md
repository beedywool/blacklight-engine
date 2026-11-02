# Steamworks

_Checked 2026-11. Valve's fees and review times change; the links at the end are the reference._

`blacklight build --target steam` builds the game with Steamworks inside and writes the scripts that `steamcmd` uploads; `blacklight upload --target steam` runs them. Everything on Valve's side, the partner account, the App ID, the depots and the account that uploads, is yours. Until you have them, `steam: { appId: 480 }` (Spacewar, Valve's public test app) lets you try overlay, achievements calls and the build locally.

| Credential                 | Cost                                                           | Where it goes                                                   |
| -------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| Steamworks partner account | free to create; Steam Direct fee per app (100 USD, recoupable) | partner.steamgames.com                                          |
| App ID                     | given when the Steam Direct fee is paid                        | `steam.appId` in `game.config.ts`                               |
| Depots (one per OS)        | included                                                       | `steam.depots` in `game.config.ts` if not the defaults          |
| Builder account            | free (a separate Steam account)                                | `STEAM_USERNAME` (password and Steam Guard asked by `steamcmd`) |

Prerequisites: a Steam account for yourself, bank details and tax information for the legal entity (or person) that sells the game, and a phone for Steam Guard.

## 1. Partner account and Steam Direct

1. Sign in at [partner.steamgames.com](https://partner.steamgames.com) with your Steam account and choose to join Steamworks. Fill the company or individual details, sign the Steam Distribution Agreement, and complete the bank, tax (an online tax interview) and identity verification steps.
2. Pay the **Steam Direct** fee for the game: 100 USD per app at the time of writing, returned in your payouts once the game earns 1,000 USD in adjusted gross revenue. See Valve's current terms.
3. Valve gives the new app an **App ID**. Put it in `game.config.ts`:

```ts
steam: { appId: 1234560 },
```

What you get: the App ID, the store page and build tools, achievements, Steam Cloud and the overlay for that app. Valve asks for a waiting period between paying the first fee and releasing, a "coming soon" store page visible for some time before launch, and a review of both the store page and a build; plan several weeks.

## 2. Depots

A depot is a set of files Steam installs for a given OS. The CLI uploads one per OS: by default `appId + 1` (Windows), `appId + 2` (macOS), `appId + 3` (Linux), which are the ids Steamworks proposes for the first depots of a new app.

1. In Steamworks → your app → **Edit Steamworks Settings** → **SteamPipe** → **Depots**, add the depots. Set each depot's **Operating System** so Steam only installs it on that OS.
2. If the ids differ from the defaults, list them:

```ts
steam: { appId: 1234560, depots: { windows: 1234561, mac: 1234562, linux: 1234563 } },
```

3. In **Installation** → **General**, add one launch option per OS pointing at the executable in that depot (the files of `release/steam/content/<os>/`).
4. **Publish** the changes (the **Publish** tab): Steamworks settings only apply once published.

## 3. Builder account and steamcmd

Valve recommends uploading with a dedicated Steam account rather than your own.

1. Create a new Steam account (`mystudio_builder`), turn on Steam Guard.
2. In Steamworks → **Users & Permissions** → **Manage Users**, invite it and give it only the permissions to edit and publish this app's builds (**Edit App Metadata** and **Publish App Changes To Steam** for that app).
3. Install `steamcmd` from the Steamworks SDK (**tools/ContentBuilder/builder**, `builder_linux` or `builder_osx`) or Valve's standalone download, and put it on the `PATH`.
4. Log in once by hand so Steam Guard trusts the machine: `steamcmd +login mystudio_builder +quit`.

```sh
pnpm blacklight build --target steam                       # on each OS: release/steam/content/<os>/
pnpm blacklight upload --target steam --dry-run            # prints the steamcmd command, uploads nothing
STEAM_USERNAME=mystudio_builder pnpm blacklight upload --target steam
```

The build appears in Steamworks → **SteamPipe** → **Builds**; set it live on a branch there.

## Limits

- The template workflow does not upload to Steam: `steamcmd` needs the builder's password and a Steam Guard confirmation, which do not fit a CI runner without storing a logged-in session. Upload from a machine where the builder account is trusted.
- Each OS is built on that OS and copied into the same `release/steam/content/` before one upload; the CLI does not merge builds from several machines for you.
- Store page, pricing, achievements definitions and release are done in Steamworks, not in the CLI.

## Official documentation

- [Steamworks documentation](https://partner.steamgames.com/doc/home)
- [Steam Direct](https://partner.steamgames.com/steamdirect)
- [Uploading to Steam (SteamPipe)](https://partner.steamgames.com/doc/sdk/uploading)
- [Release process](https://partner.steamgames.com/doc/store/releasing)
