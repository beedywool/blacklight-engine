# eightDirections

Top-down movement driven by input.

```ts
static override behaviors = [behaviors.eightDirections({ speed: 240, acceleration: 1800 })];
```

| Option         | Default                       | Meaning                                |
| -------------- | ----------------------------- | -------------------------------------- |
| `speed`        | required                      | Top speed in px/s.                     |
| `acceleration` | instant                       | px/s² to reach top speed.              |
| `deceleration` | instant                       | px/s² to stop.                         |
| `actions`      | `left`, `right`, `up`, `down` | Actions read from the object's player. |

`facing` holds the last direction moved (`'down'` at first), one of the eight names used by [directional animations](../guide/sprites-and-animations#directions-and-fallback). Diagonal speed is capped at `speed`. Hitting a solid zeroes the velocity on that axis.

## Example

<LiveExample src="behaviors/eight-directions" hint="Click the preview, then move with the arrows or WASD." />
