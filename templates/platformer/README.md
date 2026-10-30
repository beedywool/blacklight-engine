# Platformer

A Blacklight Engine template: one side-scrolling level made in Tiled, with a hero that runs and
jumps, coins, slimes to squash, a checkpoint, a goal, a pause menu and on-screen controls for
phones. Keyboard, gamepad and touch drive the same actions.

```sh
pnpm install
pnpm dev
```

| Where                                | What                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `scenes/title`                       | Title scene; its screen is `ui/TitleScreen.vue`                                                             |
| `scenes/level`                       | The level. `assets/level-1.json` is a Tiled map: the `ground` tile layer and the `objects` point layer      |
| `scenes/level/assets`                | Tileset (`tiles.png`) and sounds, preloaded with the scene                                                  |
| `objects/hero`                       | The player: `platformer` behavior, animations in `hero.anim.json`, reactions to coins, slimes, flags        |
| `objects/slime`                      | Enemy walking with the `patrol` behavior; its walk length comes from the Tiled object's `distance` property |
| `objects/coin`, `checkpoint`, `goal` | Pickups and level markers                                                                                   |
| `objects/touch-controls`             | Virtual joystick (left half) and jump / pause buttons, shown once the screen is touched                     |
| `ui/`                                | HUD, pause menu, level clear screen; `ui/progress.ts` holds the run's state shared with the scene           |

## Editing the level

Open `scenes/level/assets/level-1.json` in [Tiled](https://www.mapeditor.org) (1.10 or later) and
save it as JSON in place. Tile properties carry over: `solid` and `jumpThru` tiles block the hero,
`hazard` tiles (water) send it back to the last checkpoint, and tile animations play. In the
`objects` layer, a point's type is the object to spawn (`Coin`, `Slime`, `Checkpoint`, `Goal`) and
`Start` places the hero; custom properties become fields of the spawned object.

## Controls

| Action | Keyboard        | Gamepad           | Touch               |
| ------ | --------------- | ----------------- | ------------------- |
| Move   | arrows, A / D   | D-pad, left stick | joystick, left half |
| Jump   | Space, Z, Up, W | A                 | round button        |
| Pause  | Escape          | Start             | pause button        |

The art and sounds are placeholders made for this template (CC0); replace the PNG and WAV files
under the same names.
