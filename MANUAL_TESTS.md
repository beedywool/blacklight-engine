# Manual tests

What CI cannot check (SPEC §11.3). Run before each release; every step says what you should see. Grouped by device.

## Any desktop browser

1. `pnpm create blacklight my-game && cd my-game && pnpm install && pnpm dev`, open the printed URL. Expected: black page, white dot pulsing, "My Game" and the edit hint centered.
2. Resize the window to very wide, then very tall. Expected: the content stays centered and fully visible, never stretched.

## Runtime fixture (any desktop browser)

Run `pnpm --filter blacklight-fixture-runtime dev` and open the printed URL.

1. Press the arrow keys. Expected: the blue character walks (two-frame run animation), faces left when walking left, stops at the grey wall.
2. Walk over the yellow coins. Expected: each coin disappears with a short beep, audible through the speakers.
3. Press F3, F4, F6, F7, F8. Expected: debug panel; hitboxes drawn (green, orange for solids, yellow when touching); pause; one step per F7; slow motion.

## Gamepads in the browser

For each pad (Xbox, PlayStation, Switch Pro, one generic USB pad), in Chrome and Firefox on Windows, macOS and Linux, with the runtime fixture:

1. Move with the left stick and the D-pad. Expected: the character moves; stick movement is proportional, nothing moves when the stick rests.
2. For a generic pad without the standard mapping, check the face buttons map to A/B/X/Y positions. Expected: matches the SDL database layout; note the pad and browser if not.

## Touch

On a phone (Android Chrome, iPhone Safari), open the fixture with `pnpm dev --host`:

1. Touch the left half and drag. Expected (when the scene has a `virtualJoystick` object): the joystick appears under the finger and the character moves.
2. Expected: the first tap unlocks sound; coins beep afterwards.

## UI (templates/persona-menu)

Run `pnpm --filter blacklight-template-persona-menu dev`.

1. With an Xbox, a PlayStation and a Switch Pro pad in turn: the prompts at the bottom show that pad's buttons (A / Cross / B at the bottom position); the keyboard shows Enter / Esc after a key press.
2. In CONFIG › DISPLAY › NAME, confirm with a pad. Expected: the on-screen keyboard opens; typing and Done update the name.
3. With a Japanese IME (keyboard), type in the NAME field. Expected: the candidate window works; the name changes only once a candidate is committed.
4. CONFIG › CONTROLS: confirm an action, press another key or pad button. Expected: the prompt for that action changes everywhere at once.
5. On a phone (landscape), tap menu rows. Expected: one tap focuses and selects; nothing scrolls the page.

Device-specific sections (gamepads per OS, Android, iPhone, Steam client, Discord, store signing) are added by the phases that implement them.

## Light 3D (templates/2d-with-3d)

Run `pnpm --filter blacklight-template-2d-with-3d build && pnpm --filter blacklight-template-2d-with-3d preview --host` and open the printed URL on each device.

1. Desktop Chrome, Firefox and Safari: press Enter, walk the red robot with the arrows into the grey pillar. Expected: the pillar covers the robot, the robot covers the grass and sky; the robot turns towards where it walks and its legs move; X makes it wave. The blue robot (Draco file) patrols, the crate (KTX2 texture) turns with a wood texture; the round portrait top right is sepia and cut to the circle.
2. Same: press Escape. Expected: the menu shows the robot turning on a dark card while the game behind stays still; Resume returns to the game.
3. Same, with the network disconnected after the first load (or Electron / Capacitor build once available): reload, enter the arena. Expected: identical to step 1 (models and decoders come from the game's files).
4. Samsung Galaxy A54 (Chrome) and iPhone 12 (Safari), landscape: open `/#bench`, wait 7 s. Expected: the line at the top reads 58 fps or more and CPU under 8 ms; note the numbers in docs (3D page, performance table). Then `/#bench-2d` for the 2D baseline.
5. Same phones: open the arena and the pause menu. Expected: no visible stutter while walking; the menu model turns smoothly.

## Modules and platform services (phase 3e)

Automated with mocks: `e2e/modules.spec.ts` (registry, `blacklight add`, sql.js, OIDC against a mock provider, offline queues) and the module unit tests. These need real accounts, devices or services.

### BlackLight SSO, web (any desktop browser)

1. Add the game to BlackLight SSO's `OIDC_CLIENTS`: `{"clientId":"my-game","name":"My Game","redirectUris":["http://localhost:5173/"],"scopes":["openid","profile","offline_access"],"public":true}`, restart the SSO.
2. In a game: `blacklight add accounts-oidc`, set `'accounts-oidc': { preset: 'blacklight', issuer: '<your SSO URL>', clientId: 'my-game' }`, `pnpm dev`, call `game.modules['accounts-oidc'].login()` from a button (or the console: `blacklight.modules['accounts-oidc'].login()`).
3. Expected: the tab goes to BlackLight SSO, asks to sign in and to allow "My Game", comes back to the game with no `code=` in the address bar; `blacklight.modules['accounts-oidc'].user.name` is your BlackLight name.
4. Close the browser, open the game again. Expected: still signed in (`user` set) without a new consent page; `await blacklight.modules['accounts-oidc'].accessToken()` returns a token.
5. In BlackLight SSO, disconnect the app from the account privacy settings, reload the game, call `accessToken()`. Expected: `undefined`, the module emits `expired`, `user` is `undefined`.

### BlackLight SSO from the desktop and mobile apps (after the desktop and mobile packages are merged)

1. Register `com.example.mygame:/oauth/callback` in `OIDC_CLIENTS`. Build the desktop app (`blacklight build --target linux|win|mac`) and run it.
2. Sign in. Expected: the system browser (not a window of the game) opens BlackLight SSO; after consent the OS asks to open the game (custom scheme), the game shows the signed-in player; the browser tab can be closed.
3. Quit and start the app. Expected: still signed in; the refresh token is in the OS keystore (Keychain Access / Credential Manager / Secret Service), not in the data folder.
4. Repeat 1–3 on an Android phone and an iPhone (`blacklight run --target android|ios`). Expected: Chrome Custom Tab / SFSafariViewController-style system browser, back to the app through the scheme.

### Reference server with Docker

1. On a server with Docker and a TLS reverse proxy: follow `docs/guide/server.md` (games.json, `.env` with `SESSION_SECRET`, `OIDC_PROVIDERS` pointing at BlackLight SSO with the game's client id), `docker compose up --build -d`.
2. `curl https://<host>/health`. Expected: `{"ok":true}`.
3. In the game, set `server: 'https://<host>'` in the accounts-oidc options, sign in. Expected: `blacklight.modules['accounts-oidc'].serverAccount.identities` lists the BlackLight identity.
4. Unlock an achievement while the network is off (airplane mode), turn it back on. Expected: within a few seconds `achievements.pending` is 0 and `GET /v1/games/<id>/achievements` with the session shows it.
5. Save on device A, start the game on device B signed in with the same account. Expected: B downloads the slot at startup (cloud-save `downloaded` event). Change the slot on both while offline, go online on B then A with `conflict: 'ask'`. Expected: A's `onConflict` handler is called with both copies.
6. `docker compose down && docker compose up -d`. Expected: accounts, saves and scores are still there (volume).

### SQLite on each platform

1. Desktop (after the desktop merge): a game with `sqlite: { migrations: [...] }` inserts rows, quit, restart. Expected: rows are there; `<data folder>/databases/game.db` and `game.db-wal` exist.
2. Android and iPhone (after the mobile merge): same steps. Expected: same rows after a restart, also in airplane mode.
3. Safari 16 (no writable OPFS on the main thread): same steps in the web build. Expected: rows survive a reload (IndexedDB fallback).

### Steam (Steam client, app id 480 "Spacewar" for tests)

1. `achievements: { backend: 'auto' }`, run the Steam build from the Steam client, unlock `ACH_WIN_ONE_GAME`. Expected: the Steam overlay or the library page shows the achievement.
2. Unlock while Steam is offline (Steam › Go Offline), go back online. Expected: the unlock reaches Steam (queue replay).
3. `cloud-save: { backend: 'steam' }`: save on one PC, start on another PC signed in to the same Steam account. Expected: the slot is downloaded at startup.
4. `submitScore` then `leaderboard()` on a Spacewar leaderboard. Expected: your score and Steam name in the list.

### Game Center and Google Play Games

1. iPhone with a sandbox Game Center account, app registered in App Store Connect with an achievement and a leaderboard: unlock and submit a score. Expected: Game Center banner; the achievement and score appear in the Game Center UI.
2. Android with a Play Games test account: same steps. Expected: Play Games pop-up; achievement and score in Play Games.

### Telemetry with a real backend

1. Create a project in a self-hosted Sentry or GlitchTip, copy its DSN to `telemetry: { dsn }`, build the web game, accept the consent dialog, throw an error from a scene.
2. Expected: the issue appears with the stack trace (`app:///assets/...` file names), release `<id>@<version>`, tag `platform`; no user, no IP address, no device name in the event JSON.
3. Refuse consent (or `setConsent(false)`), throw again. Expected: nothing reaches the backend.

## Online play (packages/net, servers/relay)

Run `pnpm build`, then `pnpm --filter @blacklight/relay start` on one machine (prints its LAN addresses), and `pnpm --filter blacklight-fixture-net dev --host` (Push-Push online fixture).

1. Open the fixture without parameters. Expected: four wrestlers in a ring; you steer the white one with the arrows and shove with X; the three bots play over a simulated 150 ms, 2 % loss network in the page. Movement of your wrestler is immediate; the others correct themselves now and then (rollback) without jumping across the ring.
2. On machine A open the fixture's network URL followed by `?relay=ws://<relay-address>:5360&players=2`, read the room code with `window.netState.room` in the console; on machine B (another OS or browser) open the same URL with `?relay=ws://<relay-address>:5360&room=<CODE>`. Expected: both start the match; each controls one wrestler; positions match on both screens; `window.netState.desyncs` stays empty after several rounds.
3. Repeat step 2 with an iPhone (Safari) against a Windows or Linux PC (Chrome). Expected: no desync after five minutes (`window.netState.desyncs` empty on both): JavaScriptCore against V8 on real devices.
4. On a Linux machine with the WebKit dependencies (`sudo pnpm exec playwright install-deps webkit`), run `pnpm e2e e2e/net.spec.ts`. Expected: the WebKit test runs instead of being skipped and passes (it is skipped on hosts without WebKit's system libraries; CI installs them).
5. Docker: `pnpm --filter @blacklight/relay build && docker build -t blacklight-relay servers/relay && docker run --rm -p 5360:5360 blacklight-relay`, then `curl localhost:5360/health`. Expected: `{"ok":true,…}`; step 2 works against this container; the image is about 240 MB (node:24-alpine).
6. Desktop LAN hosting (once `@blacklight/native` registers the `relay` module): in the desktop build call `hostLan(game)`, then join from a second machine on the same network with the address it returns. Expected: the OS firewall asks once; the match plays as in step 2.
