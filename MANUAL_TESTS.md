# Manual tests

What CI cannot check (SPEC §11.3): real gamepads, real phones, the reference phones of NF-01 to NF-03, a real Windows PC, the Steam and Discord clients, real signing credentials, other people's accounts and the GitHub release itself. Every step says what you should see. Run the whole list before a release and the relevant sections after a change to that area. Commands run from a checkout of the engine after `pnpm install && pnpm build`, unless the step says otherwise.

Sections are grouped by device:

1. [Desktop browser](#desktop-browser-any-os)
2. [Gamepads](#gamepads-each-desktop-os)
3. [Desktop apps](#desktop-apps-windows-10-macos-12-ubuntu-2204)
4. [Windows PC](#windows-pc-a-real-windows-10-pc-with-a-gpu)
5. [Mac](#mac-apple-silicon-and-intel)
6. [Android phone](#android-phone-android-8-or-later)
7. [iPhone](#iphone-ios-15-or-later-and-a-mac-with-xcode)
8. [Reference phones: NF-01, NF-02, NF-03](#reference-phones-samsung-galaxy-a54-and-iphone-12)
9. [Steam client](#steam-client)
10. [Discord desktop](#discord-desktop)
11. [Signing with real credentials](#signing-and-notarization-your-credentials)
12. [Accounts and online services](#accounts-and-online-services)
13. [Online play on several machines](#online-play-several-machines)
14. [VS Code](#vs-code-extension-and-tooling)
15. [GitHub](#github-game-build-workflow-and-engine-release)

## Desktop browser (any OS)

### New game

1. `pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game && cd my-game && pnpm install && pnpm dev`, open the printed URL. Expected: black page, white dot pulsing, "My Game" and the edit hint centered.
2. Resize the window to very wide, then very tall. Expected: the content stays centered and fully visible, never stretched.

### Older browser versions (NF-05)

CI runs one build of each engine (Playwright's Chromium, Firefox and WebKit). NF-05 asks for the last two versions of Chrome, Firefox and Safari.

1. In the previous major version of each browser, open the release build of `party-game` and `visual-novel` (`pnpm --dir templates/<name> build && pnpm --dir templates/<name> preview`). Expected: the title screen appears, keys and the mouse work, no error in the console.

### Runtime fixture

Run `pnpm --filter blacklight-fixture-runtime dev` and open the printed URL.

1. Press the arrow keys. Expected: the blue character walks (two-frame run animation), faces left when walking left, stops at the grey wall.
2. Walk over the yellow coins. Expected: each coin disappears with a short beep, audible through the speakers.
3. Press F3, F4, F6, F7, F8. Expected: debug panel; hitboxes drawn (green, orange for solids, yellow when touching); pause; one step per F7; slow motion.

### UI (templates/persona-menu)

Run `pnpm --filter blacklight-template-persona-menu dev`.

1. Keyboard: the prompts at the bottom show Enter / Esc after a key press.
2. With a Japanese IME, type in CONFIG › DISPLAY › NAME. Expected: the candidate window works; the name changes only once a candidate is committed.
3. CONFIG › CONTROLS: confirm an action, press another key. Expected: the prompt for that action changes everywhere at once.

### Light 3D (templates/2d-with-3d)

Run `pnpm --filter blacklight-template-2d-with-3d build && pnpm --filter blacklight-template-2d-with-3d preview --host`.

1. Chrome, Firefox and Safari: press Enter, walk the red robot with the arrows into the grey pillar. Expected: the pillar covers the robot, the robot covers the grass and sky; the robot turns towards where it walks and its legs move; X makes it wave. The blue robot (Draco file) patrols, the crate (KTX2 texture) turns with a wood texture; the round portrait top right is sepia and cut to the circle.
2. Press Escape. Expected: the menu shows the robot turning on a dark card while the game behind stays still; Resume returns to the game.
3. Disconnect the network after the first load, reload, enter the arena. Expected: identical to step 1 (models and decoders come from the game's files).

### Visual novel (templates/visual-novel)

Run `pnpm --filter blacklight-template-visual-novel dev`.

1. Safari on macOS: NEW GAME, then the cutscene. Expected: the MP4 plays (`document.querySelector('.bl-cutscene video').currentSrc` ends in `.mp4`), with sound, subtitles at the bottom; holding Enter skips it.
2. Safari: the title logo (NEON RAIN) is visible, either with the red/blue glitch or plain (WebKit refuses foreignObject drawing into WebGL), without errors; `data-bl-pixi-render` is `rendered` or `fallback`.
3. Speakers on: the title music loops, the first Mira line plays a short voice murmur, the rooftop line plays a chime, typing blips are audible.
4. Windows (Microsoft IME) and macOS (Kotoeri): NEW GAME, type a Japanese name with the system IME (あおい → 葵). Expected: the composition shows underlined in the field, the name is committed once, the story says 葵.
5. SETTINGS › LANGUAGE › 日本語 then العربية. Expected: Japanese lines wrap between words, never before 。 or 、; Arabic letters are joined (no isolated forms), the text and the dialogue name plate are on the right, menus read right to left.
6. SETTINGS › ACCESSIBILITY: text size 200 % (dialogue and backlog text double), high contrast (dark outline on text, black dialogue box), each color filter (the red UI and lantern shift hue; grayscale removes color), reduced motion ON (screens and covers appear without animation, letters stop waving).
7. VIDEO › FULL SCREEN toggles the browser's full screen and back.
8. Press F9 and point at menu items and the dialogue box. Expected: the inspector names the component (MenuList, DialogueBox), its props and state, and the focused element.

### Platformer template

`pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz jumper --template platformer && cd jumper && pnpm install && pnpm dev`.

1. Title screen, Enter. Expected: the level fades in; the HUD shows `0 / 30` coins and the jump and pause prompts with keyboard keys.
2. Run with the arrows, jump with Space; hold Space for a high jump, tap it for a short one. Expected: run and jump animations, the camera follows smoothly and stops at the level edges; the hills scroll slower than the ground.
3. Jump onto a wooden plank from below. Expected: the hero passes through it and lands on top (one-way platform).
4. Walk into a slime. Expected: hurt sound, short shake, the hero blinks back at the start (or the raised checkpoint flag). Land on a slime from above. Expected: it flattens and disappears, the hero bounces.
5. Fall into the water. Expected: back at the last checkpoint.
6. Walk past the grey flag in the middle of the level. Expected: the flag turns red; later hits bring the hero back there.
7. Reach the star at the end. Expected: chime, "LEVEL CLEAR" with the coin count; PLAY AGAIN restarts the level.

### Party game, mouse (templates/party-game)

Run `pnpm --filter blacklight-template-party-game dev`.

1. Hide and Seek with a mouse: in the guess stage click a hider standing in the open. Expected: the crosshair jumps there and the hider is found; clicking a block is refused.

### Installed web app (PWA), desktop

Build a template (`pnpm build` in it) and host `dist/` on an HTTPS server you control (docs/guide/deploy-web.md), or use `pnpm preview --host` behind an HTTPS tunnel.

1. Chrome or Edge: the install icon in the address bar. Expected: the game opens in its own window without browser controls; with the network disconnected it still starts.
2. Build again after a visible change (a different title text), upload, open the installed game online, close it completely and open it again. Expected: the second start shows the change; DevTools › Application › Cache storage lists only the new `blacklight:<id>:<version>` cache.
3. With the http module pointed at a server and the network off, trigger a request. Expected: the game shows its offline handling (no crash); with the network back, queued writes reach the server.

### Documentation site

1. `pnpm docs:build && pnpm --filter blacklight-docs preview`, open `http://localhost:4173/behaviors/platformer`. Expected: the preview starts when scrolled into view; after a click on it, arrows and Space move and jump the character.
2. Change `jumpStrength` in the editor. Expected: the preview restarts within a second with the new jump.
3. Open `/playground`, edit a file, copy the address bar into another browser. Expected: the same files and the same game.
4. Open `/guide/ui-widgets` on a phone. Expected: editor under each preview, previews readable, taps reach the widgets.
5. Serve `docs/.vitepress/dist` behind the production CSP (docs/guide/deploy-docs.md) and open a page with examples. Expected: no CSP violation in the console; the runner page carries its own policy (`blob:` scripts).

## Gamepads (each desktop OS)

Pads: an Xbox (Series or One), a PlayStation (DualSense or DualShock 4), a Switch Pro and one generic USB pad. Run each subsection on Windows, macOS and Linux.

### In the browser (Chrome and Firefox)

With the runtime fixture (`pnpm --filter blacklight-fixture-runtime dev`):

1. Move with the left stick and the D-pad. Expected: the character moves; stick movement is proportional, nothing moves when the stick rests.
2. Generic pad without the standard mapping: check the face buttons map to the A/B/X/Y positions. Expected: matches the SDL database layout; note the pad and browser if not.

With `templates/persona-menu` (`pnpm --filter blacklight-template-persona-menu dev`):

3. Each pad in turn. Expected: the prompts at the bottom show that pad's buttons (A / Cross / B at the bottom position).
4. CONFIG › DISPLAY › NAME, confirm with a pad. Expected: the on-screen keyboard opens; typing and Done update the name.
5. CONFIG › CONTROLS: confirm an action, press a pad button. Expected: the prompt for that action changes everywhere at once.

With `templates/visual-novel`:

6. Xbox and PlayStation pads: navigate the title menu, the dialogue (A advances, the D-pad reaches AUTO/SKIP/LOG…), the choices, the backlog, SETTINGS › CONTROLS rebinding (press a pad button). Expected: every screen is usable without keyboard or mouse.

With the platformer template:

7. D-pad or stick runs, A / Cross / B (Switch) jumps, Start pauses. Expected: the HUD and menus switch to that pad's glyphs as soon as it is used.

### Four pads in party-game

1. Four pads plus the keyboard: LOCAL PARTY, then press A (Cross; B on Switch) on each pad. Expected: players 2 to 4 join in order, each pad moves only its own card (D-pad: profile and skin), B on a joined pad leaves, the keyboard stays player 1.
2. Play every mini-game with those players. Expected: each pad steers its own character, Y (Triangle; X on Switch) puts the shield on its owner only, Start (Options, +) on any pad pauses the game and the pause menu is navigable from any pad; in Survival VS a hit rumbles the pad of the player hit.

### Desktop app (SDL): hot plug, rumble, light bar, gyro

In the desktop build of `templates/persona-menu` (`pnpm --dir templates/persona-menu exec blacklight build --target <win|mac|linux>`):

1. Plug a pad while the game runs, then unplug it. Expected: the pad works without a restart; the UI prompts switch to its glyphs; unplugging releases its buttons.
2. Call `this.input.player(1).rumble(1, 0.5, 400)` from a test scene key. Expected: both motors rumble. On an Xbox pad, `gamepad(game, 0).rumbleTriggers(0, 1, 400)`. Expected: the right trigger rumbles.
3. DualSense or DualShock 4: `gamepad(game, 0).led('#ff0000')`. Expected: the light bar turns red.
4. Gyro: `gamepad(game, 0).hasGyro` is `false` on every pad. This is an accepted limitation: the SDL binding exposes no controller sensors (docs/guide/limitations.md "Controller motion sensors are not read"). Note it if a pad reports `true`.

## Desktop apps (Windows 10+, macOS 12+, Ubuntu 22.04+)

### Packaged fixture

Build on each OS: `pnpm --dir e2e/fixtures/desktop exec blacklight build --target <win|mac|linux>`, install the package from `e2e/fixtures/desktop/release/<os>/`.

1. Install and start (NSIS installer and portable .exe; dmg and zip on Intel and Apple silicon; AppImage and deb). Expected: a black window with a blue square, no menu bar (macOS: app menu only), no console.
2. Resize the window by its corner. Expected: the content keeps 16:9 (the window snaps back to the ratio). F11 and Alt+Enter (macOS: Cmd+Ctrl+F) toggle fullscreen; restart: the last choice is kept.
3. Press Enter twice, quit with Escape, start again. Expected: the save file is in `%APPDATA%\dev.blacklight.fixture.desktop\saves`, `~/Library/Application Support/dev.blacklight.fixture.desktop/saves` or `~/.local/share/dev.blacklight.fixture.desktop/saves`; opening `1.sav` in a text editor shows no readable data. The save key (`save.key` in the app's user-data folder) is encrypted by the OS keystore: macOS asks once for access to "<app> Safe Storage" in the login Keychain (the e2e test uses Chromium's mock Keychain, since a CI runner has nobody to answer), Windows uses DPAPI, Linux the Secret Service.
4. Change one byte of `1.sav` with a hex editor, start the game. Expected: it loads the previous save (gold 10 instead of 20).
5. Press F12, Ctrl+Shift+I, Cmd+Alt+I, right-click. Expected: nothing opens. Start the app from a terminal with `--remote-debugging-port=9222`, then with `--inspect`. Expected: it exits at once with "refusing to start with debugging switches".
6. With the app installed, open `dev.blacklight.fixture.desktop:/oauth/callback?code=1` from a browser. Expected: the running game receives `deeplink` with that URL (the OIDC login of the accounts module completes the same way).

### SQLite in the desktop app

1. A game with `sqlite: { migrations: [...] }` inserts rows, quit, restart. Expected: the rows are there; `<data folder>/databases/game.db` and `game.db-wal` exist.

### NF-02: cold start on real Windows and Mac hardware

CI measures the packaged app on GitHub's macOS runner (a virtual machine) against the 3 s limit only, and Windows is not measured in CI. This checks the limit on real hardware, and the case CI cannot reproduce: the first launch after a reboot, when the OS has none of the app's files in its cache. Use a Windows 10+ PC and a Mac (macOS 12+), on mains power, with your usual programs open.

1. `pnpm exec playwright install chromium && pnpm exec playwright test cold-start --project=bench`. Expected: four `[bench] cold-start-…` lines (web and desktop, party-game and visual-novel) with a median under 3000 ms, and the tests pass (the first run on a machine records its results in `bench-results/` and has no baseline to compare with). Copy the four medians into docs/benchmarks.md (NF-02) with the machine, the OS version and the date.
2. First launch after a reboot: `pnpm --dir templates/party-game exec blacklight build --target <win|mac> --dir`, reboot, log in and wait one minute. Start `templates/party-game/release/win/win-unpacked/Party Night.exe` (macOS: `templates/party-game/release/mac/mac-arm64/Party Night.app`, or `mac/mac/` on Intel) with a stopwatch running from the double-click. Expected: the title screen is up and moves to the next screen on Enter in under 3 s. Note the time in docs/benchmarks.md as "first launch after reboot".
3. Same as step 2 for `templates/visual-novel` (the app is `Neon Rain`). Expected: under 3 s.
4. Delete the `release/` folders of both templates.

## Windows PC (a real Windows 10+ PC with a GPU)

CI runs neither the e2e suite nor the benchmarks on Windows: GitHub's Windows runners have no GPU and their software rendering made those tests fail at random (DECISIONS.md 2026-11-02). On Windows CI keeps the unit tests (with the relay test of two headless party-game instances playing online), the VS Code extension tests and the installer build. These steps cover the rest; prerequisites are in CONTRIBUTING.md, "e2e tests and benchmarks on Windows".

1. `pnpm exec playwright install chromium firefox webkit`, then `pnpm e2e`. Expected: the summary reports no failed test (skipped tests give their reason, e.g. the two-browser online matches). If it wrote new screenshots under `e2e/__screenshots__/`, open each one: the scene must look like the Linux and macOS references apart from font rendering.
2. With other programs closed, `pnpm bench`. Expected: every test passes; on the first run of the machine the results go to `bench-results/` (store them with `BLACKLIGHT_BENCH_UPDATE=1 pnpm bench` and commit `e2e/bench-baseline.json`); on later runs each `[bench]` line shows no metric more than 10 % worse than the baseline, the NF-01 lines show 57 fps or more, and the four `cold-start-…` medians stay under 3000 ms.
3. Note the machine, GPU, Windows version, date and the NF-01 and NF-02 numbers in docs/benchmarks.md ("Windows PC" rows).
4. Firefox with default settings: open `about:support` and check that "WebGL 2 Driver Renderer" names the GPU (CI's Windows runner has none, so its Firefox gets WebGL 2 only with `webgl.force-enabled`). Open the release build of every template (`pnpm --dir templates/<name> build && pnpm --dir templates/<name> preview`). Expected: each title screen appears, `2d-with-3d` shows its models and the KTX2 crate texture, keys and the mouse work, no error in the console.
5. Online match on two Windows PCs: see [Online play](#online-play-several-machines), step 6.

## Mac (Apple silicon and Intel)

### Safari

1. `templates/2d-with-3d` and `templates/visual-novel` steps of the desktop browser section in Safari (WebKit's WebGL 2 and video paths differ from Chromium's).
2. Safari 16 (no writable OPFS on the main thread), a web build with `sqlite: { migrations: [...] }`: insert rows, reload. Expected: the rows survive the reload (IndexedDB fallback).

### Rosetta first launch

`e2e/desktop.spec.ts` starts both slices of the universal Steam app on the CI runner; the x86_64 start waited over a minute there while Rosetta translated the Electron framework. This checks what a player on Apple silicon sees with the Intel build.

1. On an Apple silicon Mac that has never run the app: `pnpm --dir templates/party-game exec blacklight build --target mac`, open the x64 dmg from `templates/party-game/release/mac/`, drag the app to Applications, start it. If macOS offers to install Rosetta, accept. Expected: the title screen appears (the first start may take up to a minute while Rosetta translates the app; note the time) and plays normally.
2. Quit and start it again. Expected: the title screen in under 3 s (the translation is cached).
3. `pnpm --dir templates/party-game exec blacklight build --target steam`, then `arch -x86_64 "templates/party-game/release/steam/content/mac/Party Night.app/Contents/MacOS/Party Night"`. Expected: the game starts under Rosetta and logs no "steamworks.js is missing".

## Android phone (Android 8 or later)

Enable developer options and USB debugging (Settings › About phone › tap Build number seven times › Developer options › USB debugging), connect the phone, accept the computer's key, check that `adb devices` lists it as `device`.

### Mobile fixture and templates

1. `pnpm --filter blacklight-fixture-mobile exec blacklight build --target android --run`. Expected: the app "Mobile Gate" installs and opens in landscape, full screen (no status or navigation bar), a blue disc on a dark background.
2. Turn on airplane mode, close the app from the recent apps, open it again. Expected: it starts the same way (assets are inside the APK).
3. Tap the screen three times. Expected: the disc gets lighter with each tap (the fixture does not vibrate).
4. Press the back button or swipe back from the edge. Expected: the app stays open (back is a game action).
5. Press Home, wait 10 s, reopen from recents. Expected: the game is where it was; no sound plays in the background.
6. Leave the phone untouched for longer than its screen timeout. Expected: the screen stays on while the app is in the foreground.
7. Force-stop the app (Settings › Apps › Mobile Gate › Force stop) and reopen it. Expected: the disc has the same lightness as before (the encrypted save was read back).
8. `pnpm --filter blacklight-template-persona-menu exec blacklight build --target android --run`. Expected: the menu opens; one tap focuses and selects a row; nothing scrolls the page; back closes submenus; the camera cutout never covers menu text.
9. A game with `sqlite: { migrations: [...] }` built for Android: insert rows, force-stop, reopen, also in airplane mode. Expected: the rows are there.
10. Release build: create a keystore (`keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`), export `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, run `blacklight build --target android --release --run` in the fixture. Expected: `apksigner verify --print-certs release/android/mobile-gate-1.2.3.apk` shows your certificate; `chrome://inspect` in Chrome on the computer does not list the app's WebView.
11. `blacklight build --target android --aab`, upload the `.aab` to a Play Console internal testing track. Expected: accepted without signing or version errors.

### Touch and browser

Open the runtime fixture (`pnpm --filter blacklight-fixture-runtime dev --host`) and the platformer template (`pnpm dev --host`) in Chrome on the phone, using the Network URL.

1. Fixture: touch the left half and drag. Expected (the scene has a `virtualJoystick` object): the joystick appears under the finger and the character moves. The first tap unlocks sound; coins beep afterwards.
2. Platformer: a round jump button bottom right and a pause button top right; a thumb on the left half shows a joystick under it that runs left and right; both thumbs at once run and jump. A key press on a desktop hides the touch controls again.
3. Visual novel in Chrome: the cutscene plays the WebM; the red gradient fades in from black during the first second (alpha channel); holding the screen skips it.
4. PWA: open a hosted template build (see the desktop PWA section), menu › Install app. Expected: the game's name and 192 px icon on the home screen; it opens full screen, landscape, no browser bar, black splash. Turn on airplane mode and open it from the home screen. Expected: it starts and every scene plays, sounds included.

### Google Play Games (Play Console account)

1. Create the game in Play Console › Play Games Services, add an achievement `first_win` and an incremental one `collector` (10 steps), link the app (package and SHA-1 of the upload key), publish the configuration to testers, add your Google account as tester.
2. Set `mobile.playGamesAppId` in `game.config.ts`, build with `--release` signed with the linked key, install. Expected: `invoke('playgames', 'signIn')` shows the Play Games sign-in once, then resolves `{ authenticated: true, displayName }`.
3. `invoke('playgames', 'unlock', 'first_win')`. Expected: the Play Games "achievement unlocked" pop-up; `invoke('playgames', 'show')` lists it as unlocked.
4. `invoke('playgames', 'progress', 'collector', 4, 10)`. Expected: the achievements screen shows 4/10.
5. With the achievements module (`backend: 'auto'`), unlock and submit a score. Expected: Play Games pop-up; the achievement and the score appear in Play Games.

## iPhone (iOS 15 or later, and a Mac with Xcode)

The CI `ios` job runs the fixture on the iOS Simulator (launch with embedded files, a tap, an encrypted save with the Keychain key read back after a relaunch). These steps cover a real device, real touches and the deep link.

### Mobile fixture and templates

1. On the Mac: `pnpm --filter blacklight-fixture-mobile exec blacklight build --target ios --dry-run`, open `.blacklight/mobile/ios/App/App.xcodeproj`, set your team under Signing & Capabilities, run on the phone. Expected: landscape, no status bar, blue disc.
2. Airplane mode, kill the app, reopen. Expected: starts the same way.
3. Tap three times. Expected: the disc gets lighter with each tap.
4. Kill the app from the app switcher, reopen. Expected: same lightness (save read back with the Keychain key).
5. Deep link: open `dev.blacklight.fixture.mobile://tap` in Safari, tap Open on the "Open in “Mobile Gate”?" prompt. Expected: the app opens and the disc gets lighter once. (The Simulator test cannot confirm that prompt, so the deep link is checked here only.)
6. Home, wait, reopen. Expected: the game resumes, no audio while in the background; the screen does not dim while playing.
7. `persona-menu` template on the phone: menus fit inside the safe area (notch or Dynamic Island, home indicator); one tap focuses and selects a row.
8. A game with `sqlite: { migrations: [...] }`: insert rows, kill the app, reopen, also in airplane mode. Expected: the rows are there.
9. Release: `APPLE_TEAM_ID=<team> blacklight build --target ios --release`. Expected: `release/ios/*.ipa`; uploading it with Transporter succeeds; Safari's Develop menu on the Mac does not list the app's web view.

### Safari on the iPhone

1. Runtime fixture (`pnpm --filter blacklight-fixture-runtime dev --host`): the virtual joystick and the first-tap sound unlock, as on Android.
2. Visual novel: NEW GAME, the cutscene plays the MP4 with sound after the first tap, subtitles at the bottom; holding the screen skips it.
3. PWA: Share › Add to Home Screen on a hosted template build. Expected: the icon from `apple-touch-icon`; it opens full screen. Airplane mode, open it. Expected: plays offline.

### Game Center (App Store Connect account)

1. In App Store Connect, enable Game Center for the app and add the achievement `first_win` and a leaderboard. Set `mobile.gameCenter: true`, build and run on a device signed in to Game Center (sandbox).
2. `invoke('gamecenter', 'signIn')`. Expected: the Game Center banner "Welcome back", result `{ authenticated: true }`.
3. `invoke('gamecenter', 'unlock', 'first_win')`. Expected: completion banner; `invoke('gamecenter', 'show')` opens the achievements sheet with it completed.
4. With the achievements module (`backend: 'auto'`), submit a score. Expected: the score appears in the Game Center leaderboard.

## Reference phones (Samsung Galaxy A54 and iPhone 12)

NF-01 to NF-03 name these phones. CI and `e2e/bench-android.spec.ts` measure on an x86_64 emulator, which says nothing about a phone's GPU or flash. Charge the phone above 50 %, close other apps, turn off battery saver / Low Power Mode, hold it in landscape. Record every result in docs/benchmarks.md (the "Reference phones" table) with the date and the OS and WebView versions.

### NF-01: 60 fps with 300 animated sprites and an animated UI screen

The benchmark fixture `e2e/fixtures/bench` shows its result at the bottom of the screen 7 s after it starts.

1. Galaxy A54, app build: `pnpm --dir e2e/fixtures/bench exec blacklight build --target android --run`. Expected: the bottom line reads 58 fps or more, 1 % low 50 or more.
2. Galaxy A54, Chrome: `pnpm --dir e2e/fixtures/bench build && pnpm --dir e2e/fixtures/bench preview --host`, open the printed network URL. Expected: same thresholds.
3. iPhone 12, app build on a Mac: `pnpm --dir e2e/fixtures/bench exec blacklight build --target ios --dry-run`, open `.blacklight/mobile/ios/App/App.xcodeproj`, set your team, run on the phone. Expected: 58 fps or more, 1 % low 50 or more.
4. iPhone 12, Safari: open the preview URL of step 2. Expected: same thresholds.
5. On each phone, reload three times and keep the lowest fps of the three. Expected: the cards slide in and out, the ring turns, the gauge and the counter change, and no visible stutter while the sprites cross the screen.
6. Galaxy A54, automated (the spec CI runs on an emulator): with the phone connected, `ANDROID_SERIAL=<serial> BLACKLIGHT_E2E_ANDROID=1 pnpm exec playwright test --project=bench bench-android -g NF-01`. Expected: both NF-01 tests pass, the `[bench] android-bench` line reads 58 fps or more with a 1 % low of 50 or more (the test has no baseline for this phone and does not check fps itself). Copy the line and the median of `bench-results/android-bench.json`; the spec uninstalls the app when it ends.
7. 3D budget (templates/2d-with-3d): `pnpm --filter blacklight-template-2d-with-3d build && pnpm --filter blacklight-template-2d-with-3d preview --host`, open `/#bench` on each phone, wait 7 s. Expected: the line at the top reads 58 fps or more and CPU under 8 ms; then `/#bench-2d` for the 2D baseline. Open the arena and the pause menu: no visible stutter while walking, the menu model turns smoothly.

### NF-02 and NF-03: start time and memory

1. Galaxy A54, automated: `ANDROID_SERIAL=<serial> BLACKLIGHT_E2E_ANDROID=1 pnpm exec playwright test --project=bench bench-android -g "NF-02|NF-03"`. Expected: the `[bench] android-cold-start-party-game` and `…-visual-novel` lines show a median under 5000 ms, the `[bench] android-memory-party-game` line a peak under 300 MB, and the tests pass.
2. Galaxy A54, GPU memory (counted on a phone, not on the emulator): `pnpm --dir templates/party-game exec blacklight build --target android --run`, join four players (keyboard plus three Bluetooth pads, or the touch screen and pads), start Survival VS, and during the match run `adb shell dumpsys meminfo com.example.partynight` and `adb shell dumpsys meminfo $(adb shell pidof com.google.android.webview:sandboxed_process0:org.chromium.content.app.SandboxedProcessService0:0)` (the renderer; if `pidof` finds nothing, take its pid from `adb shell ps -A | grep sandboxed`). Expected: the two `TOTAL PSS` values add up to under 300 MB (300 × 1024 kB); note them with the `Graphics:` lines.
3. iPhone 12, start time: on a Mac, `pnpm --dir templates/party-game exec blacklight build --target ios --dry-run`, open `.blacklight/mobile/ios/App/App.xcodeproj`, set your team, choose the Release configuration (Product › Scheme › Edit Scheme › Run › Build Configuration), run once on the phone, stop it in Xcode and swipe the app away. Start a screen recording, tap the app's icon, wait for the title screen, stop the recording. Count from the frame where the icon reacts to the first frame that shows the title screen with its menu. Expected: under 5 s. Repeat three times, note the median; same for `templates/visual-novel`.
4. iPhone 12, memory: run party-game from Xcode in the Release configuration, then Xcode › Open Developer Tool › Instruments › Activity Monitor, target the phone, record. Join players (Xbox, PlayStation or MFi pads over Bluetooth) and play Survival VS for 30 s. Expected: the app's memory plus that of its `com.apple.WebKit.WebContent` process stays under 300 MB at its highest; note both.
5. Remove the apps from the phones afterwards.

## Steam client

Use the test app id 480 ("Spacewar") unless the step needs your own. Start the game while the Steam client runs and is signed in.

1. `steam: { appId: 480 }` in a game, `blacklight build --target steam`, start `release/steam/content/<os>/` from a terminal. Expected: Steam shows "Spacewar" as playing.
2. `steam(game).unlock('ACH_WIN_ONE_GAME')`. Expected: the Steam notification appears; `isUnlocked` is `true`; `clear` locks it again. With the achievements module (`backend: 'auto'`) the same unlock shows in the overlay or on the library page.
3. Unlock while Steam is offline (Steam › Go Offline), go back online. Expected: the unlock reaches Steam (queue replay).
4. `steam(game).setRichPresence('status', 'In the menu')`. Expected: the friends list shows the status.
5. Cloud: `game.save.useCloud(steam(game).cloud)` (or `cloud-save: { backend: 'steam' }`), save, then start the game on a second machine signed in to the same account (`game.save.sync()`). Expected: the slot downloads; Steam's Cloud page of the app lists `save-1.json`.
6. In the Steam build with the achievements module on `backend: 'auto'`, call `leaderboard('<board>')`. Expected: it fails with "Steam leaderboards are not available: steamworks.js 0.4.0 does not expose them. Use the reference server for scores." (accepted limitation, docs/guide/limitations.md "No Steam leaderboards").
7. Overlay: Shift+Tab on Windows, macOS and Linux. Expected: the overlay opens. It may not on some OS and GPU combinations (accepted limitation, docs/guide/limitations.md "The Steam overlay may not show in Electron"); note the OS, GPU and result.
8. Your own app id and depots (Steamworks partner account, docs/publishing/steam.md): `STEAM_USERNAME=<builder> pnpm blacklight upload --target steam --dry-run`, then without `--dry-run`. Expected: steamcmd logs in and uploads the depots; the build appears in Steamworks › SteamPipe › Builds.

## Discord desktop

1. Create an application in the Discord developer portal, put its id in `discord: { appId }`, run the game with `presence.setActivity({ details: 'Testing', state: 'Lobby', party: { id: 'p1', size: 1, max: 4, joinSecret: 'code' } })`. Expected: your Discord profile shows the game, "Testing", "Lobby (1 of 4)".
2. From a second account (a friend), click "Ask to join". Expected: the game receives `onJoinRequest` with the friend's name; `accept(user.id)` sends the invite.
3. The friend clicks "Join". Expected: the friend's game receives `onJoin('code')`.
4. Quit Discord, start it again while the game runs. Expected: the presence comes back within 15 seconds.

## Signing and notarization (your credentials)

The engine never holds credentials: they come from the game's developer (docs/publishing/). CI checks the signing plans with `--dry-run` only.

1. Windows, certificate file: `WIN_CSC_LINK=<cert.pfx> WIN_CSC_KEY_PASSWORD=… pnpm blacklight sign --dry-run --target win`, then `blacklight build --target win`. Expected: the plan lists `signtool` with the password masked; the installer and the portable .exe are signed (Properties › Digital Signatures) and SmartScreen shows the publisher.
2. Windows, Azure Trusted Signing (a validated identity and a Public Trust certificate profile, docs/publishing/windows.md): set the seven `AZURE_*` variables and no `WIN_CSC_LINK`, run `blacklight sign --dry-run --target win`, then `blacklight build --target win`. Expected: the plan shows `Invoke-TrustedSigning` with your account and profile; the installer's Digital Signatures tab shows your publisher name with a timestamp.
3. macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` set (docs/publishing/apple.md), `blacklight build --target mac`. Expected: notarization succeeds, `xcrun stapler validate` passes, `codesign -dv --verbose=4` and `spctl -a -vv` accept the app, and the dmg opens without a Gatekeeper warning on another Mac.
4. Android and iOS release signing: Android phone step 10, iPhone step 9 above.
5. `pnpm blacklight doctor` on Windows (with and without `WIN_CSC_LINK`), macOS (with Xcode and a Developer ID identity, then without) and Linux with an Android SDK and JDK 21. Expected: each target is `ready` or lists exactly what is missing with a fix; missing signing shows as a warning.

## Accounts and online services

### OIDC sign-in with your provider

The engine has no default issuer: the game configures its own (docs/publishing/oidc.md). These steps use a BlackLight SSO you host; any OIDC provider with PKCE works the same way.

1. Register a public client: `{"clientId":"my-game","name":"My Game","redirectUris":["http://localhost:5173/"],"scopes":["openid","profile","offline_access"],"public":true}` in the SSO's `OIDC_CLIENTS`, restart the SSO.
2. In a game: `pnpm blacklight add accounts-oidc`, set `'accounts-oidc': { preset: 'blacklight', issuer: '<your SSO URL>', clientId: 'my-game' }`, `pnpm dev`, call `blacklight.modules['accounts-oidc'].login()` from the console. Expected: the tab goes to the SSO, asks to sign in and to allow "My Game", comes back to the game with no `code=` in the address bar; `user.name` is your account name.
3. Close the browser, open the game again. Expected: still signed in without a new consent page; `await blacklight.modules['accounts-oidc'].accessToken()` returns a token.
4. Disconnect the app from the account's privacy settings in the SSO, reload, call `accessToken()`. Expected: `undefined`, the module emits `expired`, `user` is `undefined`.
5. Desktop app: register `com.example.mygame:/oauth/callback`, build (`blacklight build --target <os>`), sign in. Expected: the system browser (not a game window) opens the SSO; after consent the OS asks to open the game, which shows the signed-in player. Quit and start again: still signed in, the refresh token is in the OS keystore (Keychain Access, Credential Manager, Secret Service), not in the data folder.
6. Android and iPhone (`blacklight run --target android|ios`): same as step 5. Expected: the system browser sheet, back to the app through the scheme.
7. party-game: with `accountsIssuer` empty in `templates/party-game/game.config.ts` the title has no SIGN IN entry and LOCAL PARTY plays with guests. Set it to your issuer (client `party-night` registered with the page URL), restart, TITLE › SIGN IN. Expected: the provider's page opens; after consent the title shows SIGN OUT with the account name, and the join screen offers `★ <name>` to one player at a time.

### Reference server with Docker

1. On a server with Docker and a TLS reverse proxy: follow docs/guide/deploy-server.md (`games.json`, `.env` with `SESSION_SECRET`, `OIDC_PROVIDERS` pointing at your issuer with the game's client id), `docker compose up --build -d`.
2. `curl https://<host>/health`. Expected: `{"ok":true}`.
3. In the game, set `server: 'https://<host>'` in the accounts-oidc options, sign in. Expected: `blacklight.modules['accounts-oidc'].serverAccount.identities` lists the provider's identity.
4. Unlock an achievement with the network off, turn it back on. Expected: within a few seconds `achievements.pending` is 0 and `GET /v1/games/<id>/achievements` with the session shows it.
5. Save on device A, start the game on device B signed in with the same account. Expected: B downloads the slot at startup (`downloaded` event of cloud-save). Change the slot on both while offline, go online on B then A with `conflict: 'ask'`. Expected: A's `onConflict` handler receives both copies.
6. `docker compose down && docker compose up -d`. Expected: accounts, saves and scores are still there (volume).

### Telemetry with a real backend

1. Create a project in a self-hosted Sentry or GlitchTip, put its DSN in `telemetry: { dsn }`, build the web game, accept the consent dialog, throw an error from a scene. Expected: the issue appears with the stack trace (`app:///assets/...` file names), release `<id>@<version>`, tag `platform`; no user, no IP address, no device name in the event JSON.
2. Refuse consent (or `setConsent(false)`), throw again. Expected: nothing reaches the backend.

## Online play (several machines)

Run `pnpm --filter @blacklight/relay start` on one machine (it prints its LAN addresses), and `pnpm --filter blacklight-fixture-net dev --host` (the Push-Push online fixture).

1. Open the fixture without parameters. Expected: four wrestlers in a ring; you steer the white one with the arrows and shove with X; the three bots play over a simulated 150 ms, 2 % loss network in the page. Your wrestler moves at once; the others correct themselves now and then (rollback) without jumping across the ring.
2. On machine A open the fixture's network URL with `?relay=ws://<relay-address>:5360&players=2`, read the room code with `window.netState.room`; on machine B (another OS or browser) open it with `?relay=ws://<relay-address>:5360&room=<CODE>`. Expected: both start the match, each controls one wrestler, positions match on both screens, `window.netState.desyncs` stays empty after several rounds.
3. Step 2 with an iPhone (Safari) against a Windows or Linux PC (Chrome). Expected: no desync after five minutes (`window.netState.desyncs` empty on both): JavaScriptCore against V8 on real devices.
4. party-game on two machines: run a relay (`pnpm exec blacklight-relay`, or the desktop app's LAN relay), ONLINE on both with its address, HOST A ROOM / JOIN with the code, READY!, START. Expected: both play the same Push-Push, then each other mini-game, to the end with identical scores on both screens.
5. Desktop LAN hosting: in a desktop build call `hostLan(game)`, join from a second machine on the network with the address it returns. Expected: the OS firewall asks once; the match plays as in step 2.
6. Two Windows PCs (CI on Windows plays the online match only between two headless games over the relay, without rendering): both on the same network, a relay on one, party-game on both (the dev server with `--host`, or the desktop build), ONLINE with the relay's address, HOST A ROOM (Push-Push, 30 s) / JOIN, READY!, START, play the match to the end with both players moving and shoving. Expected: the match starts on both screens within a few seconds, the wrestlers are in the same places throughout, no desync toast or console error, both screens end with identical scores and RESULTS shows the same podium.
7. Docker: `pnpm --filter @blacklight/relay build && docker build -t blacklight-relay servers/relay && docker run --rm -p 5360:5360 blacklight-relay`, then `curl localhost:5360/health`. Expected: `{"ok":true,…}`; step 2 works against this container; the image is about 240 MB (node:24-alpine).
8. Linux with WebKit's system libraries (`sudo pnpm exec playwright install-deps webkit`): `pnpm e2e e2e/net.spec.ts`. Expected: the WebKit test runs instead of being skipped, and passes.

## VS Code extension and tooling

Install the extension of the release (`code --install-extension blacklight-vscode-<version>.vsix`), or from the checkout: `pnpm --filter blacklight-vscode package && code --install-extension packages/vscode/dist/blacklight.vsix`. Open `e2e/fixtures/tooling` (or a new game) in VS Code with Chrome installed and run `pnpm dev` in its terminal. The integration tests in CI cover each feature's logic; these steps check what a person sees.

1. `pnpm blacklight run --target web`. Expected: the default browser opens on the game. Then `--target android` and `--target <os>`. Expected: the game starts on the emulator or in its window (or a message naming `blacklight build` when the runner is missing).
2. With the game open in Chrome, move the hero, then change `rate()` in `scenes/arena/arena.scene.ts` and save; change `greeting()` in `objects/hero/hero.object.ts` and save; change the title in `ui/Menu.vue` (open it with F) and save. Expected: no page reload, the hero stays where it was, the menu stays open with the new title.
3. **Blacklight: Debug Game in Browser**, breakpoint in `update()` of `objects/hero/hero.object.ts`. Expected: Chrome opens on the game and stops on the breakpoint at the right line; variables show `this.hp`, stepping works. Repeat with `"browser": "msedge"` on Windows.
4. **Live Objects** view. Expected: scene `arena` with Hero and two Coins, positions updating while the hero moves; clicking `hp` and typing `9` changes it in the game; pause and step buttons work.
5. Right-click `objects/hero/hero@16x16.png` › **Slice Sprite Sheet**: change the frame size, click frames, Shift-click a range, add two animations, Save. Expected: the grid matches the frames, the preview animates, the file is renamed and the `.anim.json` written.
6. `objects/hero/hero.anim.json` › **Open Animation Editor**: change FPS, frames (`0-3`), loop. Expected: the preview changes at once and the JSON beside it updates; typing in the JSON updates the preview.
7. `scenes/arena/arena.layout.json`: drag the hero, place a coin (pick, click), nudge with arrows, delete with Delete, undo with Ctrl+Z. Expected: the canvas shows the sprites, the JSON stays one object per line, undo works; reload the game: objects are where placed.
8. `ui/Menu.vue` › **Preview UI Component**. Expected: the game appears in the panel with the menu open; clicking each focus state moves the white focus outline; **Cycle states** steps through them; saving the `.vue` updates the frame without losing the menu.
9. `animations/menu-intro.timeline.json`: drag bars, resize a bar, change easing; with the menu open in the game, **Play in game**. Expected: the bars follow the edits, the JSON stays readable, the menu animates in the game.
10. `game.config.ts` › **Edit Game Configuration**: change the name, the width, add an action. Expected: only those values change in the file (comments kept), the game reloads with them.
11. **Blacklight: Open Asset Browser**. Expected: thumbnails of every image, `assets/unused.png` marked unused, **Weight per scene** lists the arena's files with sizes.
12. Every panel in the default dark theme and in a light theme. Expected: the panels keep the BlackLight look (black surface, white focus), text stays readable.

## GitHub: game build workflow and engine release

### Build workflow of a new game (a GitHub account)

1. `pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game --template platformer`, `cd my-game`, `pnpm install`, commit everything including `pnpm-lock.yaml`, push to a new GitHub repository. Expected: the "Build" workflow runs six jobs (web, desktop win / mac / linux, android, ios) and each uploads an artifact.
2. Download the artifacts. Expected: `web` holds the PWA, `desktop-win` the NSIS installer and portable .exe, `desktop-mac` dmg + zip for x64 and arm64, `desktop-linux` AppImage + deb, `android` a debug APK that installs with `adb install`, `ios` the Simulator `.app`.
3. With no secret at all. Expected: every job succeeds, and the run summary shows one notice per unsigned job (Windows, macOS, Android, iOS) naming the secrets to add; the Windows log never shows `CSC_LINK` set even when the macOS secrets exist.
4. Add the signing secrets named in `.github/workflows/build.yml` (docs/publishing/github-secrets.md) and run it again (Actions › Build › Run workflow). Expected: signed installers and a release APK.
5. With only the iOS secrets (`APPLE_TEAM_ID`, `IOS_DIST_CERT_P12`, `IOS_DIST_CERT_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, key with the Admin role). Expected: the `ios` artifact also holds a signed `.ipa` that Transporter accepts.
6. With the Android keystore secrets. Expected: the `android` artifact holds a signed release APK and an `.aab` that the Play Console accepts in an internal testing release.

### Engine release (push rights on the engine repository)

The release workflow is checked by a dry run and `e2e/release.spec.ts` (a packed release served from a local folder); the real GitHub Release, the Pages deployment and the download URLs need a real tag.

1. Once: repository Settings › Pages › Source: "GitHub Actions". Expected: the page names no branch.
2. Cut the release as CONTRIBUTING.md "Versions and releases" says (version, changelog, tag, `git push origin v<version>`), then `gh run watch <id> --exit-status`. Expected: `pack`, `release` and `registry` succeed; the release page lists one `.tgz` per package (19 files with `create-blacklight.tgz`) and `blacklight-vscode-<version>.vsix`, and the notes start with the summary of `docs/release-notes-1.0.md` (for a `x.y.0` release that has one), followed by the changelog section of the version.
3. `curl -s https://beedywool.github.io/blacklight-engine/registry/v1/modules/sqlite.json`. Expected: `"version"` is the new version and `"tarball"` is that release's `blacklight-module-sqlite-<version>.tgz` URL.
4. On a clean machine (no engine checkout, no pnpm cache of the engine), in an empty folder: `pnpm dlx https://github.com/beedywool/blacklight-engine/releases/latest/download/create-blacklight.tgz my-game && cd my-game && pnpm install && pnpm dev`. Expected: every `@blacklight/*` entry of `package.json` is a URL of the new release, the install fetches them from github.com, the game opens in the browser; `pnpm build` passes.
5. `pnpm blacklight add sqlite`, then `pnpm blacklight add accounts-oidc`. Expected: both modules come from the same release's URLs; the second ends with the line asking for `issuer` and `clientId`.
6. Download `blacklight-vscode-<version>.vsix` from the release, `code --install-extension blacklight-vscode-<version>.vsix` (or Install from VSIX… in the Extensions view). Expected: "Blacklight Engine" at that version in the Extensions view; it activates in `my-game`.
7. After a second release: `pnpm blacklight upgrade` in `my-game`. Expected: every engine URL moves to the newer release, `pnpm install` runs, `pnpm build` passes.
