# destroyOutsideLayout

Destroys the object once it is fully outside the scene bounds.

| Option   | Default | Meaning                                            |
| -------- | ------- | -------------------------------------------------- |
| `margin` | `64`    | Distance outside the bounds before destroying, px. |

```ts
static override behaviors = [behaviors.bullet({ speed: 900 }), behaviors.destroyOutsideLayout()];
```

The scene bounds are the design size, or `static size` of the scene.

## Example

<LiveExample src="behaviors/destroy-outside-layout" hint="The object count stays flat while sparks keep falling off the scene." />
