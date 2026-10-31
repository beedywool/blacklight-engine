# Debugging

The dev server (`pnpm dev`) adds a debug overlay and exposes the running game on `window.blacklight`. Release builds contain neither: the generated entry imports `@blacklight/core/debug` only in dev, and the bundler drops it from `pnpm build`.

## Debug overlay

| Key  | Action                                                                                        |
| ---- | --------------------------------------------------------------------------------------------- |
| `F3` | Shows or hides the overlay panel.                                                             |
| `F4` | Draws every hitbox: orange for solids, yellow while touching another object, green otherwise. |
| `F6` | Pauses or resumes the game logic.                                                             |
| `F7` | Pauses, then runs exactly one fixed step.                                                     |
| `F8` | Slow motion: `game.time.scale` 0.25, press again for 1.                                       |

The panel shows the frame rate, the step count and the pause and slow-motion state; the scene and its overlays; the number of objects and tweens, with the twelve most common object types; the last input device, joined players and connected gamepads; the last four sounds played. The key list is also printed in the browser console when the game starts.

## The game in the console

In dev, `window.blacklight` is the `Game`:

```js
blacklight.scene.find('Hero').x;
blacklight.scene.objects.length;
blacklight.goto('battle');
blacklight.input.rebind('jump', ['KeyK']);
blacklight.time.scale = 0.5;
blacklight.audio.history;
```

Everything documented on `Game`, `Scene` and `GameObject` is reachable from there. `window.blacklightCore` is the `@blacklight/core` module of the running game, so a console session or a test can use its classes (`new blacklightCore.Random('x')`, `blacklight.scene.spawn(blacklightCore.Text, { text: 'hi' })`).

## Pause and step

`game.pause()` stops the logic; the display keeps drawing, so the paused frame stays on screen. `game.resume()` continues. `game.step(n)` runs `n` fixed steps immediately and draws, whatever the pause state. Together they make a run independent of the machine's frame rate: pause, feed input, step a known number of times, read the state.

## Deterministic tests with Playwright

The game's container (`#game`) carries `data-blacklight-state` (`loading`, then `running`) and `data-blacklight-scene` (the current scene's name), so a test can wait for the game without sleeping. Once the entry scene's first frame is rendered, the engine also sets the user timing mark `blacklight:interactive` (`performance.getEntriesByName('blacklight:interactive')`, or the Timings track of DevTools' Performance panel): its time is the page's start time, from navigation to a game that takes input. This is the pattern of the engine's own end-to-end test:

```ts
import { expect, test } from '@playwright/test';
import type { Game } from '@blacklight/core';

declare global {
  interface Window {
    blacklight: Game;
  }
}

test('the hero collects the coins', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page.locator('#game')).toHaveAttribute('data-blacklight-state', 'running');

  // Step the game by hand so the result does not depend on the frame rate.
  await page.evaluate(() => window.blacklight.pause());
  await page.keyboard.down('ArrowRight');
  const state = await page.evaluate(() => {
    const game = window.blacklight;
    game.step(80);
    const hero = game.scene!.find('Hero') as unknown as { x: number; coins: number };
    return { x: hero.x, coins: hero.coins, sounds: game.audio.history };
  });
  await page.keyboard.up('ArrowRight');

  expect(state.coins).toBe(3);
  expect(state.sounds).toEqual(['coin', 'coin', 'coin']);
  await expect(page.locator('#game canvas')).toHaveScreenshot('moving.png');
});
```

Keys held with `page.keyboard.down` are read at each step, so 80 steps of a held key move the hero exactly as far on every machine. Set `seed` in `game.config.ts` so random numbers repeat, and `pauseOnBlur: false` so a headless browser without focus keeps running. `game.audio.history` lists the sounds played, so audio is testable without listening.

## Errors on the page

When the game cannot start (an invalid `game.config.ts`, a scene or object file named differently from its folder, a missing entry scene, an error while loading or creating the first scene), the page shows the error message instead of a blank canvas, and the error is also thrown to the console. Error messages say what went wrong and how to fix it, with the closest names for typos (`Unknown scene "batle". Did you mean "battle"?`).

Errors after the game started (in `update()`, in a later `goto`) go to the browser console with their stack trace.

## Limits

- `window.blacklight`, `window.blacklightCore` and the overlay exist only in dev; a release build cannot be inspected this way.
- Hitboxes are drawn through the main camera; in split screen they line up with the first camera only. Solid tiles of tilemaps are not drawn.
- `F6`, `F7` and `F8` are taken by the overlay in dev; a game should not bind them to actions it needs to test in dev.
