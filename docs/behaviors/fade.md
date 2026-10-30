# fade

Fades the object in and out: popups, damage numbers, ghosts.

```ts
this.spawn(DamageNumber, { x, y, text: '12' }).addBehavior(
  behaviors.fade({ fadeIn: 100, wait: 400, fadeOut: 300 }),
);
```

| Option    | Default | Meaning                                  |
| --------- | ------- | ---------------------------------------- |
| `fadeIn`  | none    | Fade in over this many ms when attached. |
| `wait`    | `0`     | Then wait this long, ms.                 |
| `fadeOut` | none    | Then fade out over this many ms.         |
| `destroy` | `true`  | Destroy the object once faded out.       |

`fadeOut(ms)` starts fading out now (300 ms when neither the argument nor the option gives a duration).

## Example

<LiveExample src="behaviors/fade" hint="Click to spawn a popup; press X to fade the ghost out now." />
