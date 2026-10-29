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
