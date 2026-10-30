# patrol

Walks back and forth, turning around at each end or when blocked. Guards, enemies.

```ts
static override behaviors = [behaviors.patrol({ distance: 120, speed: 60, wait: 500 })];
```

| Option     | Default  | Meaning                                        |
| ---------- | -------- | ---------------------------------------------- |
| `distance` | required | Distance from the start position each way, px. |
| `speed`    | required | px/s.                                          |
| `axis`     | `'x'`    | `'x'` or `'y'`.                                |
| `wait`     | `0`      | Pause at each end, ms.                         |

`direction` is `1` or `-1`. The start position is read when the behavior attaches.

## Example

<LiveExample src="behaviors/patrol" hint="Pauses at the ends, a vertical axis, and a turn when blocked by the wall." />
