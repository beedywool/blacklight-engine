# dragAndDrop

Drag objects and drop them on a grid, on snap points or on targets: inventories, card games, puzzles.

```ts
static override behaviors = [
  behaviors.dragAndDrop({
    dropOn: 'slot',
    onDrop: (card, slot) => {
      if (slot) card.scene.events.emit('placed', { card, slot });
    },
  }),
];
```

| Option       | Default    | Meaning                                                                                     |
| ------------ | ---------- | ------------------------------------------------------------------------------------------- |
| `snap`       | none       | Snap to a grid of this size, or to the nearest of these points.                             |
| `snapRadius` | `Infinity` | Snap points only attract within this distance.                                              |
| `bounds`     | none       | Keep the object's position inside this rectangle while dragging.                            |
| `dropOn`     | none       | Name or tag of objects that accept drops. A drop elsewhere returns the object to its start. |
| `onDrop`     | none       | `(object, target)`; `target` is `undefined` without `dropOn` or when the drop missed.       |

The dragged object's `zIndex` is raised by 1000 while dragging, so it draws above its layer. It is a `pointer` behavior: `hovered`, `pressed` and `dragging` are available.

## Example

<LiveExample src="behaviors/drag-and-drop" hint="Drag the discs into the slots, or drop one elsewhere to see it return." />

## Limits

- Hit tests use the main camera, as for `pointer`.
