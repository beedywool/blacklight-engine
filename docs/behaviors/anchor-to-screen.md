# anchorToScreen

Keeps a world object at a fixed place on screen whatever the camera does.

| Option   | Default  | Meaning                                     |
| -------- | -------- | ------------------------------------------- |
| `x`      | required | 0 (left) to 1 (right) of the design width.  |
| `y`      | required | 0 (top) to 1 (bottom) of the design height. |
| `offset` | none     | `{ x, y }` in virtual px.                   |

```ts
static override behaviors = [behaviors.anchorToScreen({ x: 1, y: 0, offset: { x: -48, y: 48 } })];
```

For HUD elements, the `'hud'` layer is simpler; `anchorToScreen` is for objects that must stay in the world (they collide, they are lit by world effects).

## Example

<LiveExample src="behaviors/anchor-to-screen" hint="Move with the arrows: the camera follows, the red beacon stays in the corner." />
