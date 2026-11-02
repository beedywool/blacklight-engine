# OpenID Connect provider

_Checked 2026-11. Provider consoles change; their own documentation is the reference._

The `accounts-oidc` module signs players in with an OpenID Connect provider that you choose and configure; the engine has no provider of its own. You need two values from the provider, both public, both written in `game.config.ts`:

| Value      | What it is                                                      | Where it goes                       |
| ---------- | --------------------------------------------------------------- | ----------------------------------- |
| `issuer`   | the provider's URL, serving `/.well-known/openid-configuration` | `modules['accounts-oidc'].issuer`   |
| `clientId` | the id of the game, registered as a public client               | `modules['accounts-oidc'].clientId` |

There is no client secret: a game runs on the player's machine and cannot keep one, so it uses the authorization code flow with PKCE. Release builds add the issuer's origin to the CSP on their own ([Accounts](../guide/accounts#choosing-the-provider)).

```ts
// game.config.ts
modules: {
  http: {},
  'accounts-oidc': { issuer: 'https://sso.example.com', clientId: 'my-game' },
},
```

## What any provider needs

Register the game as a **public client** (also called "native", "SPA" or "PKCE" application) with:

- **Grant type**: authorization code, PKCE with S256. No implicit flow, no client secret.
- **Redirect URIs**, matched exactly:
  - every web origin that serves the game, with its path: `https://play.example.com/`, and `http://localhost:5173/` for `pnpm dev`;
  - the custom scheme of the desktop and mobile apps: `<game id>:/oauth/callback`, with the `id` from `game.config.ts` (`com.example.mygame:/oauth/callback`).
- **Scopes**: `openid` and `profile`; `offline_access` (or the provider's equivalent setting) to receive a refresh token so players stay signed in; `email` only if the game needs the address.
- **CORS**: the token and userinfo endpoints must accept requests from the web game's origin.

Check the issuer before building:

```sh
curl -s https://sso.example.com/.well-known/openid-configuration | head -c 400
```

The `issuer` field in that document must equal the URL you configure, character for character (trailing slash included).

## Self-hosted BlackLight SSO

BlackLight SSO is a self-hosted OpenID Connect service (Vue, Express, PostgreSQL, `oidc-provider`) with passwords, passkeys, two-factor codes and optional Google or Discord sign-in. It is free software you run on your own server; there is no hosted instance for games to use.

Prerequisites: a server with Docker Compose, a domain name, a TLS reverse proxy (Caddy, Traefik, nginx), and optionally an SMTP account for e-mail verification and password resets.

1. Get the BlackLight SSO sources, copy `.env.example` to `.env`, and set `POSTGRES_PASSWORD`, `SESSION_SECRET` (`openssl rand -base64 48`), `PUBLIC_URL` (the public origin, e.g. `https://sso.example.com`) and `TRUST_PROXY`.
2. Register the game in `OIDC_CLIENTS` (one line of JSON in `.env`):

```json
[
  {
    "clientId": "my-game",
    "name": "My Game",
    "redirectUris": [
      "https://play.example.com/",
      "http://localhost:5173/",
      "com.example.mygame:/oauth/callback"
    ],
    "scopes": ["openid", "profile", "offline_access"],
    "public": true
  }
]
```

3. Start it with `docker compose up --build -d` behind the TLS proxy.
4. In the game, `issuer` is the `PUBLIC_URL`, and `preset: 'blacklight'` asks for the consent step BlackLight SSO requires before it issues a refresh token:

```ts
'accounts-oidc': { preset: 'blacklight', issuer: 'https://sso.example.com', clientId: 'my-game' },
```

Cost: the server and the domain. What you get: player accounts that belong to you, no per-user fee, and the same account across your games.

## Other providers

Each one has its own console; the values to look for are the same.

- **Keycloak** (self-hosted, free): create a realm, then a client with **Client authentication** off and **Standard flow** on, add the redirect URIs and the web origins. The issuer is `https://<host>/realms/<realm>`. Offline access is a default client scope.
- **Auth0** (hosted, free tier then paid; see its current pricing): create a **Native** application, allow the callback URLs and web origins, turn on **Refresh Token Rotation**. The issuer is the tenant domain with a trailing slash, `https://<tenant>.<region>.auth0.com/` or your custom domain; copy it from the application's **Endpoints** settings.
- **Microsoft Entra ID** (hosted): register an application with the **Mobile and desktop applications** platform for the custom scheme and **Single-page application** for the web URLs. The issuer is `https://login.microsoftonline.com/<tenant id>/v2.0`.
- **Google** (hosted, free): Google's OAuth clients for installed apps and web pages expect a client secret or specific redirect formats, and Google sends refresh tokens only with its own parameters; it fits a game poorly as the only provider. Put Google behind a provider that federates it (BlackLight SSO, Keycloak, Auth0) instead. Google's token endpoints are on other origins than its issuer: add them to `security.csp.connect` if you use it directly.

## Limits

- One issuer per game. Several sign-in buttons (Google, Discord, e-mail) come from one provider that offers them.
- The provider must support PKCE (S256) for public clients and expose the discovery document.
- When the provider's token or userinfo endpoints are on another origin than the issuer, list those origins in `security.csp.connect`.

## Official documentation

- [OpenID Connect Core and Discovery](https://openid.net/developers/specs/)
- [OAuth 2.0 for Native Apps (RFC 8252)](https://www.rfc-editor.org/rfc/rfc8252) and [PKCE (RFC 7636)](https://www.rfc-editor.org/rfc/rfc7636)
- [Keycloak documentation](https://www.keycloak.org/documentation), [Auth0 documentation](https://auth0.com/docs), [Microsoft identity platform](https://learn.microsoft.com/entra/identity-platform/)
