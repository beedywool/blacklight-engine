# followTarget

Moves towards a target: homing enemies, pets, missiles.

```ts
override create() {
  this.addBehavior(behaviors.followTarget({ target: this.scene.find('Player')!, speed: 90, stopDistance: 24 }));
}
```

| Option         | Default  | Meaning                                                      |
| -------------- | -------- | ------------------------------------------------------------ |
| `target`       | required | An object, or a function returning a point (or `undefined`). |
| `speed`        | required | px/s.                                                        |
| `stopDistance` | `0`      | Stops this close to the target.                              |
| `rotate`       | `false`  | Turn to face the target.                                     |

The object stops when the target object is destroyed or the function returns `undefined`.

## Example

<LiveExample src="behaviors/follow-target" hint="Move the square with the arrows; the red missile follows the mouse." />
