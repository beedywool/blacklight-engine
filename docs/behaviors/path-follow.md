# pathFollow

Follows a list of points.

```ts
static override behaviors = [
  behaviors.pathFollow({ points: [{ x: 100, y: 100 }, { x: 600, y: 100 }], speed: 120, mode: 'pingpong' }),
];
```

| Option       | Default  | Meaning                                                                                             |
| ------------ | -------- | --------------------------------------------------------------------------------------------------- |
| `points`     | required | Points in scene coordinates.                                                                        |
| `speed`      | required | px/s.                                                                                               |
| `mode`       | `'once'` | `'once'` stops at the end, `'loop'` goes back to the first point, `'pingpong'` goes back and forth. |
| `rotate`     | `false`  | Rotate the object along the path.                                                                   |
| `onComplete` | none     | Called when a `'once'` path ends, with the object.                                                  |

State: `target` (index of the point being approached) and `finished`. The behavior sets `x` / `y` directly and ignores solids.

## Example

<LiveExample src="behaviors/path-follow" hint="Three modes on one path: loop, pingpong and once." />

## Limits

- It sets positions directly, so it passes through solids.
