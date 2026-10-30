# platformer

Side-view movement with gravity: running, variable jump height, coyote time, jump buffering, slopes, one-way platforms and moving platforms.

```ts
static override behaviors = [behaviors.platformer({ speed: 300, jumpStrength: 760, airJumps: 1 })];
```

| Option         | Default                 | Meaning                                                              |
| -------------- | ----------------------- | -------------------------------------------------------------------- |
| `speed`        | `320`                   | Top running speed in px/s.                                           |
| `acceleration` | `2400`                  | px/s² on the ground.                                                 |
| `deceleration` | `2800`                  | px/s² to stop on the ground.                                         |
| `airControl`   | `0.8`                   | Share of acceleration and deceleration available in the air, 0 to 1. |
| `gravity`      | `2200`                  | px/s².                                                               |
| `jumpStrength` | `820`                   | Initial jump speed in px/s.                                          |
| `maxFall`      | `1400`                  | Maximum falling speed in px/s.                                       |
| `coyoteTime`   | `100`                   | ms after walking off a ledge during which a jump still works.        |
| `jumpBuffer`   | `120`                   | ms before landing during which a jump press is remembered.           |
| `jumpCut`      | `0.45`                  | Upward speed is multiplied by this when jump is released early.      |
| `airJumps`     | `0`                     | Extra jumps in the air.                                              |
| `climb`        | `1`                     | Steepest walkable slope, in px up per px sideways (1 is 45°).        |
| `actions`      | `left`, `right`, `jump` | Actions read from the object's player.                               |

State for animations and game logic: `state` (`'idle'`, `'run'`, `'jump'`, `'fall'`), `facing` (`'left'` or `'right'`), `onGround`, and `platform` (the solid object stood on). `jump(strength?)` makes the object jump now, for springs or bouncing on enemies.

One-way platforms are objects with `collision: { jumpThru: true }` or `jumpThru` tiles. A solid object that moves carries what stands on it: the behavior adds the platform's movement since the last step. Walking down a slope keeps the object on the ground instead of hopping off.

## Example

<LiveExample src="behaviors/platformer" hint="Click the preview. Arrows to run, Space or Z to jump; hold for a higher jump, press again in the air for a double jump." />
