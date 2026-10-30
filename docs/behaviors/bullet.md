# bullet

Moves in a straight line, or in an arc with gravity.

```ts
// in the archer: the arrow flies along the archer's rotation
this.scene.spawn(Arrow, { x: this.x, y: this.y, rotation: this.rotation });

// arrow.object.ts
static override behaviors = [behaviors.bullet({ speed: 600, gravity: 900, rotate: true })];
```

| Option           | Default           | Meaning                                  |
| ---------------- | ----------------- | ---------------------------------------- |
| `speed`          | required          | px/s.                                    |
| `angle`          | object's rotation | Direction in degrees (0 right, 90 down). |
| `acceleration`   | `0`               | px/s² added to the speed.                |
| `gravity`        | `0`               | Downward acceleration in px/s².          |
| `rotate`         | `false`           | Rotate the object along its path.        |
| `destroyOnSolid` | `true`            | Destroy the object when it hits a solid. |

The direction is read when the behavior attaches, after spawn props, so `rotation` given to `spawn` aims the bullet.

## Example

<LiveExample src="behaviors/bullet" hint="Aim with the mouse. Every third shot falls with gravity; the wall destroys both." />
