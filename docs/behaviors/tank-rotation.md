# tankRotation

Turns with left and right, drives along its rotation with up and down: tanks, cars, ships.

| Option      | Default                                              | Meaning                                |
| ----------- | ---------------------------------------------------- | -------------------------------------- |
| `speed`     | required                                             | Forward speed in px/s.                 |
| `turnSpeed` | required                                             | Degrees per second.                    |
| `actions`   | `forward: 'up'`, `backward: 'down'`, `left`, `right` | Actions read from the object's player. |

```ts
static override behaviors = [behaviors.tankRotation({ speed: 200, turnSpeed: 180 })];
```

The helper `turnTowards(object, angle, degreesPerSecond, dt)` turns an object towards an angle at a maximum speed, for turrets.

## Example

<LiveExample src="behaviors/tank-rotation" hint="Left and right turn, up and down drive. The turret follows the mouse." />
