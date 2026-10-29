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
