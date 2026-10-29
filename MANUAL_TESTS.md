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

## Online play (packages/net, servers/relay)

Run `pnpm build`, then `pnpm --filter @blacklight/relay start` on one machine (prints its LAN addresses), and `pnpm --filter blacklight-fixture-net dev --host` (Push-Push online fixture).

1. Open the fixture without parameters. Expected: four wrestlers in a ring; you steer the white one with the arrows and shove with X; the three bots play over a simulated 150 ms, 2 % loss network in the page. Movement of your wrestler is immediate; the others correct themselves now and then (rollback) without jumping across the ring.
2. On machine A open the fixture's network URL followed by `?relay=ws://<relay-address>:5360&players=2`, read the room code with `window.netState.room` in the console; on machine B (another OS or browser) open the same URL with `?relay=ws://<relay-address>:5360&room=<CODE>`. Expected: both start the match; each controls one wrestler; positions match on both screens; `window.netState.desyncs` stays empty after several rounds.
3. Repeat step 2 with an iPhone (Safari) against a Windows or Linux PC (Chrome). Expected: no desync after five minutes (`window.netState.desyncs` empty on both): JavaScriptCore against V8 on real devices.
4. On a Linux machine with the WebKit dependencies (`sudo pnpm exec playwright install-deps webkit`), run `pnpm e2e e2e/net.spec.ts`. Expected: the WebKit test runs instead of being skipped and passes (it is skipped on hosts without WebKit's system libraries; CI installs them).
5. Docker: `pnpm --filter @blacklight/relay build && docker build -t blacklight-relay servers/relay && docker run --rm -p 5360:5360 blacklight-relay`, then `curl localhost:5360/health`. Expected: `{"ok":true,…}`; step 2 works against this container; the image is about 240 MB (node:24-alpine).
6. Desktop LAN hosting (once `@blacklight/native` registers the `relay` module): in the desktop build call `hostLan(game)`, then join from a second machine on the same network with the address it returns. Expected: the OS firewall asks once; the match plays as in step 2.
