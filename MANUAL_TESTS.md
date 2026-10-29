# Manual tests

What CI cannot check (SPEC §11.3). Run before each release; every step says what you should see. Grouped by device.

## Any desktop browser

1. `pnpm create blacklight my-game && cd my-game && pnpm install && pnpm dev`, open the printed URL. Expected: black page, white dot pulsing, "My Game" and the edit hint centered.
2. Resize the window to very wide, then very tall. Expected: the content stays centered and fully visible, never stretched.

Device-specific sections (gamepads per OS, Android, iPhone, Steam client, Discord, store signing) are added by the phases that implement them.
