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
