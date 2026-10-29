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
9. Release build: create a keystore (`keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`), export `BLACKLIGHT_ANDROID_KEYSTORE`, `BLACKLIGHT_ANDROID_KEYSTORE_PASSWORD`, `BLACKLIGHT_ANDROID_KEY_ALIAS`, run `blacklight build --target android --release --run` in the fixture. Expected: `apksigner verify --print-certs release/android/mobile-gate-1.2.3.apk` shows your certificate; in Chrome on the computer, `chrome://inspect` does not list the app's WebView.
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
8. Release: `BLACKLIGHT_IOS_TEAM_ID=<team> blacklight build --target ios --release`. Expected: `release/ios/*.ipa`; uploading it with Transporter succeeds; Safari's Develop menu on the Mac does not list the app's web view.

## Game Center (iPhone, App Store Connect account)

1. In App Store Connect, enable Game Center for the app and add the achievement `first_win`. Set `mobile.gameCenter: true`, build and run on a device signed in to Game Center (sandbox).
2. `invoke('gamecenter', 'signIn')`. Expected: the Game Center banner "Welcome back", result `{ authenticated: true }`.
3. `invoke('gamecenter', 'unlock', 'first_win')`. Expected: completion banner; `invoke('gamecenter', 'show')` opens the achievements sheet with it completed.
