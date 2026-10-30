# pointer

Click, hover and drag with mouse or touch.

```ts
const button = this.spawn(PlayButton, { x: 960, y: 700, layer: 'hud' });
button.addBehavior(behaviors.pointer({ onClick: () => this.goto('battle') }));
```

| Option      | Default | Meaning                                        |
| ----------- | ------- | ---------------------------------------------- |
| `onDown`    | none    | Pointer pressed on the object.                 |
| `onUp`      | none    | Pointer released after pressing on the object. |
| `onClick`   | none    | Pressed and released on the object.            |
| `onEnter`   | none    | Pointer moved over the object.                 |
| `onLeave`   | none    | Pointer moved off the object.                  |
| `draggable` | `false` | The object follows the pointer while pressed.  |

Each callback receives the object. State: `hovered`, `pressed`, `dragging`. The test uses the object's hitbox, or its display bounds when it has none. Objects in the `'hud'` layer are tested in screen coordinates, others in world coordinates through the main camera. The exported `hitTest(object, point)` and `pointerFor(object)` do the same in custom code.

## Example

<LiveExample src="behaviors/pointer" hint="Hover and click the cards; drag the white disc." />

## Limits

- Hit tests use the main camera; in split screen, objects seen through other cameras are not clickable.
