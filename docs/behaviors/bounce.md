# bounce

Moves and bounces off solids and the scene edges: balls, pucks.

| Option  | Default  | Meaning                          |
| ------- | -------- | -------------------------------- |
| `speed` | required | px/s.                            |
| `angle` | `45`     | Initial direction in degrees.    |
| `edges` | `true`   | Bounce off the scene bounds too. |

```ts
static override behaviors = [behaviors.bounce({ speed: 400, angle: 30 })];
```

## Example

<LiveExample src="behaviors/bounce" hint="Click to add balls." />
