# Accounts

The `accounts-oidc` module signs players in with any OpenID Connect provider, with a preset for BlackLight SSO. The game is a public client: it uses the authorization code flow with PKCE (S256) and never holds a client secret. The provider's own sign-in page opens in the system browser (or the same tab on the web), so passwords, passkeys and two-factor codes never pass through the game. The refresh token stays in the OS keystore, so the player stays signed in across restarts. With `server`, the account is also linked to the [reference server](./server) for cloud saves, achievements and leaderboards.

```sh
blacklight add accounts-oidc
```

```ts
// game.config.ts
modules: {
  http: {},
  'accounts-oidc': {
    preset: 'blacklight',
    clientId: 'my-game',
    server: 'https://game.example.com',
  },
},
```

```ts
// scenes/title/title.scene.ts
const accounts = this.game.modules['accounts-oidc'];
if (accounts.user) this.showWelcome(accounts.user.name);
accounts.on('login', (user) => this.showWelcome(user.name));

// "Sign in" button
await accounts.login();
```

## Options

| Option        | Default                                   | Meaning                                                                                                               |
| ------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `clientId`    | required                                  | Client id registered with the provider.                                                                               |
| `issuer`      | preset                                    | Issuer URL of the provider; the module reads `<issuer>/.well-known/openid-configuration`. Required without a preset.  |
| `preset`      | none                                      | `'blacklight'`: issuer `https://sso.beedywool.com` unless `issuer` is set, `prompt: 'consent'` with `offline_access`. |
| `scopes`      | `['openid', 'profile', 'offline_access']` | Scopes asked for. `offline_access` gives the refresh token; add `email` only if the game needs the address.           |
| `redirectUri` | see below                                 | Where the provider sends the player back. Must be registered with the provider exactly.                               |
| `prompt`      | preset                                    | OIDC `prompt` (`login`, `consent`, `select_account`).                                                                 |
| `server`      | none                                      | Reference server URL: the account is linked there after each sign-in, and `http` requests to it carry the session.    |
| `timeout`     | `600000`                                  | How long `login()` waits for the browser to come back on desktop and mobile (ms).                                     |

## How the login works

1. `login()` reads the discovery document, creates a random `state`, `nonce` and PKCE verifier, and builds the authorization URL with `code_challenge_method=S256`.
2. The player signs in on the provider's page:
   - **Web**: the tab goes to the provider (`location.assign`); `login()` never resolves because the page unloads. The provider redirects back to the game page with `?code=…&state=…`. When the game starts again the module matches the `state` kept in `sessionStorage`, removes `code` and `state` from the address bar, and finishes the login before the first scene. Listen to `login` or read `accounts.user` at startup.
   - **Desktop and mobile**: the page opens in the system browser (`platform.openUrl`), never in a WebView the game controls. The provider redirects to a custom scheme, `<game id>:/oauth/callback` (for example `com.example.mygame:/oauth/callback`), which the OS hands to the app; the platform raises a `deeplink` event and `login()` resolves with the player.
3. The module exchanges the code at the token endpoint (`grant_type=authorization_code`, the verifier, no secret), checks the ID token's issuer, audience, nonce and expiry, and reads the userinfo endpoint. The ID token comes straight from the provider over TLS, so the game checks its claims without verifying its signature (OpenID Connect Core 3.1.3.7); the reference server verifies signatures against the provider's keys.
4. The refresh token is stored in secure storage; the access token stays in memory. `accessToken()` refreshes it when it expires (the provider rotates refresh tokens: each works once). A refused refresh token (`invalid_grant`: expired, or the player disconnected the game at the provider) signs the player out and emits `expired`.

| Platform     | Redirect URI default                  | Refresh token kept in                                                                |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Web          | the game page (`origin` + `pathname`) | game files (IndexedDB), encrypted with the per-install non-extractable WebCrypto key |
| Desktop      | `<game id>:/oauth/callback`           | Electron `safeStorage` (`platform.invoke('secure-storage', …)`)                      |
| Android, iOS | `<game id>:/oauth/callback`           | Android Keystore, iOS Keychain (`platform.invoke('secure-storage', …)`)              |

## API

| Member                 | Meaning                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `user`                 | `{ sub, issuer, name?, username?, email?, picture? }` or `undefined`. `sub` is the stable id at the provider.                    |
| `loggedIn`             | `user !== undefined`.                                                                                                            |
| `login()`              | Signs in (see above). Rejects with `OidcError` when the player cancels (`The login was cancelled.`) or the provider refuses.     |
| `logout()`             | Forgets the tokens and the user on this device.                                                                                  |
| `logoutUrl(returnTo?)` | The provider's end-session URL, to also sign out there (`platform.openUrl`).                                                     |
| `accessToken()`        | A valid access token for the provider's APIs, refreshed when needed; `undefined` when signed out.                                |
| `serverAccount`        | `{ id, name, identities }` on the reference server, once linked.                                                                 |
| `serverToken()`        | The reference server session, renewed through the provider when it expired.                                                      |
| `playAsGuest()`        | Creates a guest account on the reference server; a later `login()` links the identity to it, keeping its saves and achievements. |
| `on(event, listener)`  | `login`, `logout`, `expired`, `error` (a web redirect that failed), `server` (the server account changed).                       |

## BlackLight SSO

Client registrations of BlackLight SSO are configuration-managed (`OIDC_CLIENTS` in its `.env`). Register the game as a public client with every redirect URI it uses, exact match:

```json
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
```

BlackLight SSO only grants `offline_access` after an explicit consent step, which is why the preset sends `prompt=consent`: the player sees "allow My Game" at each sign-in and the game receives a refresh token. Without `offline_access` the player signs in again when the access token expires. The token endpoint must allow the web game's origin (CORS) for web builds.

## Account linking

With `server`, each sign-in sends the fresh ID token to the reference server (`POST /v1/auth/oidc`), which verifies it and returns a session for the account that owns this identity, creating it the first time. When the game already holds a session (a guest account, or an account signed in with another provider), the identity is linked to that account instead. An identity already linked to another account is refused with `identity_linked`; the game shows the message and keeps the current account. Server sessions last 30 days and are renewed from the refresh token. See [Reference server](./server#accounts-and-identity-linking).

## Testing without a provider

`@blacklight/module-accounts-oidc/testing` exports `startMockProvider()`, a small OpenID Connect provider for Node tests: discovery, PKCE-checked authorization codes approved at once, refresh token rotation, userinfo, JWKS and end-session. The engine's own tests sign in against it in Node and in a real browser.

```ts
import { startMockProvider } from '@blacklight/module-accounts-oidc/testing';

const provider = await startMockProvider({ port: 5352 });
// game.config.ts: 'accounts-oidc': { issuer: provider.issuer, clientId: 'my-game' }
```

## Limits

- The web flow reloads the page: unsaved game state is lost when the player signs in, so offer sign-in from a menu, not mid-level. A popup flow is not provided because popup blockers and storage partitioning make it unreliable.
- Desktop and mobile need the custom scheme registered by the app (the desktop and mobile packages register `<game id>` from `game.config.ts`). A game id with uppercase letters or underscores is not a valid scheme on every OS; keep ids lowercase.
- On the web the refresh token is protected against copying, not against script running in the page: an XSS in the game can use it. The strict CSP of release builds is the defence.
- Only the authorization code flow with PKCE is supported: no implicit flow, no client secrets, no device code flow.
- ID token signatures are not verified on the client (see step 3); anything that grants rights checks the token on a server.
