# sineWave

Oscillates a property: floating pickups, breathing UI.

```ts
static override behaviors = [behaviors.sineWave({ property: 'y', amplitude: 6, period: 1 })];
```

| Option      | Default  | Meaning                                                    |
| ----------- | -------- | ---------------------------------------------------------- |
| `property`  | `'y'`    | `'x'`, `'y'`, `'alpha'`, `'angle'` (degrees) or `'scale'`. |
| `amplitude` | required | Half the range, in the property's unit.                    |
| `period`    | `1`      | Seconds per cycle.                                         |
| `phase`     | `0`      | Start offset, 0 to 1 of a cycle.                           |

It adds the change since the last step, so it combines with other movement instead of overwriting it.

## Example

<LiveExample src="behaviors/sine-wave" hint="One column per property: y, x, angle, scale, alpha." />
