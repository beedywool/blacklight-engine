# Reference server

`servers/reference` is a small HTTP server for the online parts of a game that need a server of their own: cloud saves, achievements, leaderboards, and player accounts linked to an OpenID Connect provider such as BlackLight SSO. The `cloud-save`, `achievements` and `accounts-oidc` modules talk to it. It is a deployable artifact: the engine ships it, you host it. Online play goes through the relay (`servers/relay`, see the networking guide), a separate server.

It runs on Node.js 24 with no npm dependencies: `node:http` for the API, `node:sqlite` for storage, `node:crypto` for tokens. One SQLite file holds every account, identity, save, achievement and score. The Docker image is the Node runtime plus the source files.

## Run with Docker

1. Create `games.json` next to `docker-compose.yml` from `servers/reference/games.example.json` (see [Games](#games)).
2. Generate the session secret and keep it in a private `.env` file next to `docker-compose.yml`:

   ```sh
   echo "SESSION_SECRET=$(openssl rand -base64 48)" > .env
   ```

3. Set `OIDC_PROVIDERS` in `docker-compose.yml` to your identity provider and your game's client id, then start the server:

   ```sh
   cd servers/reference
   docker compose up --build -d
   docker compose ps
   curl http://localhost:8080/health
   ```

The server listens on port 8080 and stores its database in the `reference_data` volume (`/data/reference.db`). Place a TLS reverse proxy (Caddy, Traefik, nginx…) in front of it for public deployments, and set `TRUST_PROXY=true` so the rate limit counts the client address from `X-Forwarded-For` rather than the proxy's.

Without Docker, from the repository:

```sh
cd servers/reference
SESSION_SECRET="$(openssl rand -base64 48)" DATA_DIR=./data GAMES_FILE=./games.example.json \
  OIDC_PROVIDERS='[{"issuer":"https://sso.example.com","audiences":["mygame"]}]' node src/index.ts
```

## Environment variables

| Variable         | Default   | Meaning                                                                                                                                |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET` | required  | Signs session tokens, at least 32 characters (`openssl rand -base64 48`). Changing it signs every player out.                          |
| `OIDC_PROVIDERS` | `[]`      | JSON array of trusted providers: `{ "issuer": "https://sso.example.com", "audiences": ["mygame"], "internalUrl": "http://sso:3000" }`. |
| `GAMES_FILE`     | none      | Path to the JSON file describing the games (below). Without it every game route answers `unknown_game`.                                |
| `PORT`           | `8080`    | Listening port.                                                                                                                        |
| `DATA_DIR`       | `/data`   | Folder of the SQLite database `reference.db`.                                                                                          |
| `CORS_ORIGINS`   | `*`       | Comma-separated web origins allowed to call the API, or `*`. Players authenticate with a bearer token, never a cookie, so `*` is safe. |
| `MAX_BODY_BYTES` | `2097152` | Largest request body (2 MiB). Saves are base64 in JSON, a third larger than their bytes.                                               |
| `TRUST_PROXY`    | `false`   | `true` behind a reverse proxy: the client address comes from the first `X-Forwarded-For` entry.                                        |

`audiences` lists the client ids the ID tokens must be issued to: the client id of each game registered at that provider. `internalUrl` is where the server reaches the provider when that differs from the public issuer (a Docker network name); the issuer in the tokens stays the public one.

## Games

`GAMES_FILE` maps each game's `id` from `game.config.ts` to what the server accepts for it. The server refuses achievement and leaderboard ids that are not listed, so a modified client cannot invent them.

```json
{
  "com.example.mygame": {
    "achievements": ["first-win", "collector"],
    "leaderboards": {
      "high-score": { "order": "desc" },
      "best-time": { "order": "asc" }
    },
    "saveMaxBytes": 1048576
  }
}
```

| Field                     | Default   | Meaning                                                              |
| ------------------------- | --------- | -------------------------------------------------------------------- |
| `achievements`            | `[]`      | Achievement ids the game may unlock.                                 |
| `leaderboards.<id>.order` | `'desc'`  | `desc`: higher scores rank first. `asc`: lower first (times, moves). |
| `saveMaxBytes`            | `1048576` | Largest save slot in bytes; larger uploads answer 413.               |

## Accounts and identity linking

The game is the OpenID Connect client: the `accounts-oidc` module runs the authorization code flow with PKCE in the system browser and receives the tokens (see [Accounts](./accounts)). It then sends the ID token to `POST /v1/auth/oidc`. The server fetches the provider's keys through its discovery document (`/.well-known/openid-configuration` → `jwks_uri`, cached for an hour, fetched again for an unknown key id at most every 30 seconds), checks the signature (RS256, ES256 or EdDSA), the issuer, the audience and the dates (60 s tolerance), and answers with its own session token, valid 30 days. The server never sees passwords, refresh tokens or client secrets, and it stores only the provider's subject and a display name (`preferred_username`, else `name`, cut to 32 characters), never the email address.

An account can exist before any identity: `POST /v1/auth/guest` creates one, so a player can save to the cloud before signing in. Sending an ID token together with a session (`Authorization: Bearer <session>`) links that identity to the session's account; one account can hold identities from several providers. An identity already linked to another account answers 409 `identity_linked`: the player signs in with it instead, or unlinks it from the other account first. `DELETE /v1/account` erases the account with its identities, saves, achievements and scores, and its session tokens stop working.

### Register the game with BlackLight SSO

BlackLight SSO only knows the clients listed in its `OIDC_CLIENTS` variable. Add the game as a public client (PKCE, no secret) with its exact redirect URIs: the web build's page and the custom scheme used by the desktop and mobile apps (the game's reverse-domain `id`):

```json
{
  "clientId": "mygame",
  "name": "My Game",
  "redirectUris": ["https://mygame.example.com/", "com.example.mygame:/oauth/callback"],
  "postLogoutRedirectUris": ["https://mygame.example.com/"],
  "scopes": ["openid", "profile", "offline_access"],
  "public": true
}
```

Then trust it on the reference server with `OIDC_PROVIDERS=[{"issuer":"https://sso.example.com","audiences":["mygame"]}]`, and point the modules at the server: the `server` option of `accounts-oidc` ([Accounts](./accounts)), `cloud-save` ([Cloud saves](./modules#cloud-save)) and `achievements` ([Achievements](./achievements)).

## HTTP API

Requests and answers are JSON. Errors answer `{ "error": "<code>", "message": "<sentence>" }` with the matching status. Every route under `/v1/games/<game>/` and `/v1/account` needs `Authorization: Bearer <session token>`; without it the answer is 401 `unauthorized`. `<game>` is the game's `id`; an unlisted game answers 404 `unknown_game`.

| Route                                               | Body                                     | Answer                                                                      |
| --------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| `GET /health`                                       |                                          | `{ ok: true }`                                                              |
| `POST /v1/auth/oidc`                                | `{ idToken }`                            | `{ token, expiresAt, account }`; 401 `invalid_token`, 409 `identity_linked` |
| `POST /v1/auth/guest`                               |                                          | `{ token, expiresAt, account }`                                             |
| `GET /v1/account`                                   |                                          | `{ id, name, identities: [{ issuer, subject }] }`                           |
| `DELETE /v1/account/identities?issuer=…&subject=…`  |                                          | the account without that identity                                           |
| `DELETE /v1/account`                                |                                          | 204, everything erased                                                      |
| `GET /v1/games/<game>/saves`                        |                                          | `{ saves: [{ slot, revision, updatedAt, size }] }`                          |
| `GET /v1/games/<game>/saves/<slot>`                 |                                          | `{ slot, revision, updatedAt, data }` (base64); 404 `not_found`             |
| `PUT /v1/games/<game>/saves/<slot>`                 | `{ data, updatedAt, baseRevision? }`     | `{ slot, revision, updatedAt, size }`; 409 `conflict`, 413                  |
| `DELETE /v1/games/<game>/saves/<slot>`              |                                          | 204                                                                         |
| `GET /v1/games/<game>/achievements`                 |                                          | `{ achievements: [{ id, unlockedAt }] }`                                    |
| `POST /v1/games/<game>/achievements/<id>`           | `{ unlockedAt? }`                        | `{ id, unlockedAt }`; 404 `unknown_achievement`                             |
| `POST /v1/games/<game>/leaderboards/<board>/scores` | `{ score }`                              | `{ best, rank }`; 404 `unknown_leaderboard`                                 |
| `GET /v1/games/<game>/leaderboards/<board>`         | `?limit=10&offset=0` (limit at most 100) | `{ entries: [{ rank, accountId, name, score, at }] }`                       |
| `GET /v1/games/<game>/leaderboards/<board>/me`      |                                          | `{ rank, score }`; 404 `not_found`                                          |

Saves are opaque bytes: the server never reads them. Each write increments the slot's `revision` (the first write is 1). A `PUT` with `baseRevision` succeeds only when the stored revision is still that number (0 for an empty slot); otherwise it answers 409 `conflict` with the server's copy in `current`, and the cloud-save module resolves the conflict (newest or player choice) before writing again. A `PUT` without `baseRevision` overwrites. Slot names use 1 to 64 letters, digits, `.`, `_` or `-`; `updatedAt` is the device's write time in ms, kept for conflict decisions.

An unlock keeps the first `unlockedAt` (a date in the future is replaced by the server's time), so the offline queue of the achievements module can replay it any number of times. A leaderboard keeps each player's best score according to the board's order; equal scores share a rank.

Each client address may send 300 requests per minute; beyond that the answer is 429 `rate_limited`. Bodies larger than `MAX_BODY_BYTES` answer 413 `too_large`.

## Backups

All data is the SQLite database in the data volume: `reference.db`, with its `reference.db-wal` and `reference.db-shm` companions while the server runs (write-ahead log). Copy it with SQLite's online backup so the copy is consistent while players write:

```sh
docker compose exec reference node -e "const { DatabaseSync } = require('node:sqlite'); new DatabaseSync('/data/reference.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp reference:/data/backup.db ./reference-$(date +%F).db
```

To restore, stop the server, replace `reference.db` in the volume (and delete the `-wal` and `-shm` files), start it again. Keep `SESSION_SECRET` with the backup: without it every player signs in again, which works but ends their sessions.

## Limits

- One instance: the database is a local SQLite file and the rate limit lives in memory, so the server does not scale horizontally. It is sized for indie games, not for millions of players.
- No admin interface: games are configured in `GAMES_FILE`, accounts are managed through the API or with SQLite directly. Changing `GAMES_FILE` needs a restart.
- No anti-cheat beyond the server-side checks: unknown achievements, leaderboards and games are refused, saves are size-limited, but a score sent by a modified client is accepted if it is a number. Games whose scores must be fair validate them in their own server logic (see [Accepted limitations](./limitations#client-side-protection-deters-it-does-not-guarantee)).
- Session tokens are stateless: signing out on one device does not revoke a token copied from it before its 30 days end; deleting the account or changing `SESSION_SECRET` does.
- The relay for online play is a separate server (`servers/relay`).
