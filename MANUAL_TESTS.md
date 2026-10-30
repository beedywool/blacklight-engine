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

## Android phone (real device, Android 8 or later)

Enable developer options and USB debugging, connect the phone, check `adb devices` lists it.

1. `pnpm --filter blacklight-fixture-mobile exec blacklight build --target android --run`. Expected: the app "Mobile Gate" installs and opens in landscape, full screen (no status or navigation bar), a blue disc on a dark background.
2. Turn on airplane mode, close the app from the recent apps, open it again. Expected: it starts the same way (assets are inside the APK).
3. Tap the screen three times. Expected: the disc gets lighter with each tap; a short haptic is not expected (the fixture does not vibrate).
4. Press the back button or swipe back from the edge. Expected: the app stays open (back is a game action).
5. Press Home, wait 10 s, reopen from recents. Expected: the game is where it was; no sound plays in the background.
6. Leave the phone untouched for longer than its screen timeout. Expected: the screen stays on while the app is in the foreground.
7. Force-stop the app (Settings › Apps › Mobile Gate › Force stop) and reopen it. Expected: the disc has the same lightness as before (the encrypted save was read back).
8. `pnpm --filter blacklight-template-persona-menu exec blacklight build --target android --run`. Expected: the menu opens; taps select rows; back closes submenus; the notch/camera cutout never covers menu text.
9. Release build: create a keystore (`keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`), export `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, run `blacklight build --target android --release --run` in the fixture. Expected: `apksigner verify --print-certs release/android/mobile-gate-1.2.3.apk` shows your certificate; in Chrome on the computer, `chrome://inspect` does not list the app's WebView.
10. `blacklight build --target android --aab`, upload the `.aab` to a Play Console internal testing track. Expected: accepted without signing or version errors.

## Google Play Games (real device, Play Console account)

1. Create the game in Play Console › Play Games Services, add an achievement `first_win` and an incremental one `collector` (10 steps), link the app (package + SHA-1 of the upload key), publish the configuration to testers, add your Google account as tester.
2. Set `mobile.playGamesAppId` in a game's `game.config.ts`, build with `--release` signed with the linked key, install. Expected: `invoke('playgames', 'signIn')` shows the Play Games sign-in once, then resolves `{ authenticated: true, displayName }`.
3. `invoke('playgames', 'unlock', 'first_win')`. Expected: the Play Games "achievement unlocked" popup; `invoke('playgames', 'show')` lists it as unlocked.
4. `invoke('playgames', 'progress', 'collector', 4, 10)`. Expected: the achievements screen shows 4/10.

## iPhone (real device, iOS 15 or later, a Mac with Xcode)

1. On the Mac: `pnpm --filter blacklight-fixture-mobile exec blacklight build --target ios --dry-run`, open `.blacklight/mobile/ios/App/App.xcodeproj`, set your team under Signing & Capabilities, run on the phone. Expected: landscape, no status bar, blue disc.
2. Airplane mode, kill the app, reopen. Expected: starts the same way.
3. Tap three times. Expected: the disc gets lighter with each tap.
4. Kill the app from the app switcher, reopen. Expected: same lightness (save read back with the Keychain key).
5. Open `dev.blacklight.fixture.mobile://tap` in Safari. Expected: the app opens and the disc gets lighter once.
6. Home, wait, reopen. Expected: the game resumes, no audio while in the background; the screen does not dim while playing.
7. `persona-menu` template on the phone: menus fit inside the safe area (notch / Dynamic Island, home indicator).
8. Release: `APPLE_TEAM_ID=<team> blacklight build --target ios --release`. Expected: `release/ios/*.ipa`; uploading it with Transporter succeeds; Safari's Develop menu on the Mac does not list the app's web view.

## Game Center (iPhone, App Store Connect account)

1. In App Store Connect, enable Game Center for the app and add the achievement `first_win`. Set `mobile.gameCenter: true`, build and run on a device signed in to Game Center (sandbox).
2. `invoke('gamecenter', 'signIn')`. Expected: the Game Center banner "Welcome back", result `{ authenticated: true }`.
3. `invoke('gamecenter', 'unlock', 'first_win')`. Expected: completion banner; `invoke('gamecenter', 'show')` opens the achievements sheet with it completed.

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

## Tooling: CLI, hot reload, VS Code extension (any desktop, VS Code with Chrome installed)

Build first: `pnpm build`, then install the extension: `pnpm --filter blacklight-vscode package && code --install-extension packages/vscode/dist/blacklight.vsix`. Open `e2e/fixtures/tooling` (or a new game) in VS Code and run `pnpm dev` in its terminal.

1. `pnpm blacklight doctor` on Windows (with and without `WIN_CSC_LINK`), macOS (with Xcode and a Developer ID identity, then without) and Linux with an Android SDK and JDK 21. Expected: each target is `ready` or lists exactly what is missing with a fix; signing shows as a warning when absent.
2. `pnpm blacklight run --target web`. Expected: the default browser opens on the game. Then `--target android` / `win` once the platform packages are installed. Expected: the game starts on the emulator / in its window (or a message naming `blacklight build` when the runner is missing).
3. With the game open in Chrome, move the hero, then change `rate()` in `scenes/arena/arena.scene.ts` and save; change `greeting()` in `objects/hero/hero.object.ts` and save; change the title in `ui/Menu.vue` (open it with F) and save. Expected: no page reload, the hero stays where it was, the menu stays open with the new title.
4. Run **Blacklight: Debug Game in Browser**, set a breakpoint in `update()` of `objects/hero/hero.object.ts`. Expected: Chrome opens on the game and stops on the breakpoint at the right line; variables show `this.hp`, stepping works. Repeat with `"browser": "msedge"` on Windows.
5. Open the **Live Objects** view. Expected: scene `arena` with Hero and two Coins, positions updating while the hero moves; clicking `hp` and typing `9` changes it in the game; pause and step buttons work.
6. Right-click `objects/hero/hero@16x16.png` > **Slice Sprite Sheet**: change the frame size, click frames, Shift-click a range, add two animations, Save. Expected: the grid overlay matches the frames, the preview animates, the file is renamed and the `.anim.json` written.
7. Open `objects/hero/hero.anim.json` > **Open Animation Editor**: change FPS, frames (`0-3`), loop. Expected: the preview changes at once and the JSON beside it updates; typing in the JSON updates the preview.
8. Open `scenes/arena/arena.layout.json`: drag the hero, place a coin (pick, click), nudge with arrows, delete with Delete, undo with Ctrl+Z. Expected: the canvas shows the sprites, the JSON stays one object per line, undo works; reload the game: objects are where placed.
9. Open `ui/Menu.vue` > **Preview UI Component**. Expected: the game appears in the panel with the menu open; clicking each focus state moves the white focus outline in the frame; **Cycle states** steps through them; saving the `.vue` updates the frame without losing the menu.
10. Open `animations/menu-intro.timeline.json`: drag bars, resize a bar, change easing; with the menu open in the game, **Play in game**. Expected: the bars follow the edits, the JSON stays readable, the menu animates in the game.
11. Open `game.config.ts` > **Edit Game Configuration**: change the name, width, add an action. Expected: only those values change in the file (comments kept), the game reloads with them.
12. **Blacklight: Open Asset Browser**. Expected: thumbnails of every image, `assets/unused.png` marked unused, **Weight per scene** lists the arena's files with sizes.
13. Check every panel in the default dark theme and a light theme. Expected: panels keep the BlackLight look (black surface, white focus), text stays readable.

## Publishing the VS Code extension (owner accounts)

1. `pnpm --filter blacklight-vscode publish:dry-run`. Expected: `dist/blacklight.vsix` is built, its file list printed, and the local stand-in registry accepts it.
2. Set the version in `packages/vscode/package.json` (it is `0.0.0` while unreleased) and the `publisher` to the Marketplace publisher id of BlackLight.
3. Marketplace: `pnpm --filter blacklight-vscode exec vsce publish --no-dependencies -p <Azure DevOps PAT with Marketplace (Manage) scope>`. Expected: the extension page shows the README, icon and categories; installing it in a clean VS Code works offline.
4. Open VSX: `pnpm --filter blacklight-vscode exec ovsx create-namespace <publisher> -p <token>` once, then `pnpm --filter blacklight-vscode exec ovsx publish dist/blacklight.vsix -p <token>`. Expected: the extension appears on open-vsx.org; VSCodium and Cursor install it.

## UI complete: visual-novel template (phase 3a)

Run `pnpm --filter blacklight-template-visual-novel dev` and open the printed URL (`--host` for phones).

1. Safari on macOS and on an iPhone: NEW GAME, then the cutscene. Expected: the MP4 plays (`document.querySelector('.bl-cutscene video').currentSrc` ends in `.mp4`), with sound after the first tap, subtitles at the bottom; holding the screen or Enter skips it.
2. Chrome on Android: the cutscene plays the WebM; the red gradient fades in from black during the first second (alpha channel).
3. Safari: the title logo (NEON RAIN) is visible. Expected: either with the red/blue glitch, or (WebKit refuses foreignObject drawing into WebGL) plain, without errors; `data-bl-pixi-render` is `rendered` or `fallback`.
4. Speakers on: the title music loops, the first Mira line plays a short voice murmur, the rooftop line plays a chime, typing blips are audible.
5. Windows (Microsoft IME) and macOS (Kotoeri): NEW GAME, type a Japanese name with the system IME (あおい → 葵). Expected: the composition shows underlined in the field, the name is committed once, the story says 葵.
6. SETTINGS › LANGUAGE › 日本語 then العربية. Expected: Japanese lines wrap between words, never before 。 or 、; Arabic letters are joined (no isolated forms), the text and the dialogue name plate are on the right, menus read right to left.
7. SETTINGS › ACCESSIBILITY: text size 200 % (dialogue and backlog text double), high contrast (dark outline on text, black dialogue box), each color filter (the red UI and lantern shift hue; grayscale removes color), reduced motion ON (screens and covers appear without animation, letters stop waving).
8. A gamepad (Xbox and PlayStation): navigate the title menu, the dialogue (A advances, the D-pad reaches AUTO/SKIP/LOG…), the choices, the backlog, SETTINGS › CONTROLS rebinding (press a pad button). Expected: every screen is usable without keyboard or mouse.
9. VIDEO › FULL SCREEN toggles the browser's full screen and back.
10. In dev, press F9 and point at menu items and the dialogue box. Expected: the inspector names the component (MenuList, DialogueBox), its props and state, and the focused element.

## Desktop app (phase 3c): Windows 10+, macOS 12+, Ubuntu 22.04+

Build the fixture on each OS: `pnpm build && pnpm --dir e2e/fixtures/desktop exec blacklight build --target <win|mac|linux>`, install the package from `e2e/fixtures/desktop/release/<os>/`.

1. Install and start (NSIS installer and portable .exe; dmg and zip on Intel and Apple Silicon; AppImage and deb). Expected: a black window with a blue square, no menu bar (macOS: app menu only), no console.
2. Resize the window by its corner. Expected: the content keeps 16:9 (the window snaps back to the ratio). F11 and Alt+Enter (macOS: Cmd+Ctrl+F) toggle fullscreen; restart: the last choice is kept.
3. Press Enter twice, quit with Escape, start again. Expected: the save file is in `%APPDATA%\dev.blacklight.fixture.desktop\saves`, `~/Library/Application Support/dev.blacklight.fixture.desktop/saves` or `~/.local/share/dev.blacklight.fixture.desktop/saves`; opening `1.sav` in a text editor shows no readable data.
4. Change one byte of `1.sav` with a hex editor, start the game. Expected: it loads the previous save (gold 10 instead of 20).
5. Press F12, Ctrl+Shift+I, Cmd+Alt+I, right-click. Expected: nothing opens. Start the app from a terminal with `--remote-debugging-port=9222` and with `--inspect`. Expected: it exits at once with "refusing to start with debugging switches".
6. macOS: `codesign -dv --verbose=4` and `spctl -a -vv` on the signed app (with certificates, below). Windows: Properties › Digital Signatures on the installer. Expected: valid signatures.

## Gamepads on desktop (SDL), each OS

With an Xbox Series, a DualSense, a Switch Pro and a generic USB pad, in the desktop build of `templates/persona-menu` (or the runtime fixture built with `--target <os>`):

1. Plug the pad while the game runs, then unplug it. Expected: the pad works without a restart; the UI prompts switch to its glyphs; unplugging releases its buttons.
2. Call `this.input.player(1).rumble(1, 0.5, 400)` (a test scene key). Expected: both motors rumble. On an Xbox pad, `gamepad(game, 0).rumbleTriggers(0, 1, 400)`. Expected: the right trigger rumbles.
3. DualSense / DualShock 4: `gamepad(game, 0).led('#ff0000')`. Expected: the light bar turns red.
4. Expected limitation: `gamepad(game, 0).hasGyro` is `false` (the SDL binding has no controller sensors).

## Steam (Steam client, Steamworks partner account)

1. With the test app: `steam: { appId: 480 }` in a game, `blacklight build --target steam`, start `release/steam/content/<os>/` from a terminal while Steam runs. Expected: Steam shows "Spacewar" as playing.
2. `steam(game).unlock('ACH_WIN_ONE_GAME')`. Expected: the Steam notification appears; `isUnlocked` is `true`; `clear` locks it again.
3. `steam(game).setRichPresence('status', 'In the menu')`. Expected: the friends list shows the status.
4. `game.save.useCloud(steam(game).cloud)`, save, then on a second machine `game.save.sync()`. Expected: the slot downloads. Steam's "Cloud" page of the app lists `save-1.json`.
5. Shift+Tab. Expected: the overlay opens (it may not, see the accepted limitation L3; note the OS and GPU).
6. With your own app id and depots: `STEAM_USERNAME=<builder> pnpm blacklight upload --target steam --dry-run`, then without `--dry-run`. Expected: steamcmd logs in, uploads the depots; the build appears in Steamworks › SteamPipe › Builds.

## Discord Rich Presence (Discord desktop running)

1. Create an application in the Discord developer portal, put its id in `discord: { appId }`, run the game with `presence.setActivity({ details: 'Testing', state: 'Lobby', party: { id: 'p1', size: 1, max: 4, joinSecret: 'code' } })`. Expected: your Discord profile shows the game, "Testing", "Lobby (1 of 4)".
2. From a second account (friend), click "Ask to join". Expected: the game receives `onJoinRequest` with the friend's name; `accept(user.id)` sends the invite.
3. The friend clicks "Join". Expected: the friend's game receives `onJoin('code')`.
4. Quit Discord, start it again while the game runs. Expected: the presence comes back within 15 seconds.

## Signing and notarization (owner certificates)

1. Windows: `WIN_CSC_LINK=<cert.pfx> WIN_CSC_KEY_PASSWORD=… pnpm blacklight sign --dry-run --target win`, then `blacklight build --target win`. Expected: the plan lists `signtool` with the password masked; the installer and the portable .exe are signed and SmartScreen shows the publisher.
2. macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` set, `blacklight build --target mac`. Expected: notarization succeeds, `xcrun stapler validate` passes, the dmg opens without a Gatekeeper warning on another Mac.

## Deep links on desktop

1. With the deb installed (Linux) or the app installed (Windows, macOS), open `dev.blacklight.fixture.desktop:/oauth/callback?code=1` from a browser. Expected: the running game receives `deeplink` with that URL (the OIDC login of the accounts module completes the same way).

## Documentation site (phase 4a, any desktop browser and a phone)

1. `pnpm build && pnpm docs:build && pnpm --filter blacklight-docs preview`, open `http://localhost:4173/behaviors/platformer`. Expected: the preview starts when scrolled into view; after a click on it, arrows and Space move and jump the character.
2. Change `jumpStrength` in the editor. Expected: the preview restarts within a second with the new jump.
3. Open `/playground`, edit a file, copy the address bar into another browser. Expected: the same files and the same game.
4. Open `/guide/ui-widgets` on a phone. Expected: editor under each preview, previews readable, taps reach the widgets.
5. Serve `docs/.vitepress/dist` behind the production CSP (see the deployment guide) and open a page with examples. Expected: no CSP violation in the console; the runner page carries its own policy (`blob:` scripts).
