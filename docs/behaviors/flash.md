# flash

Blinks the object: hit invulnerability, warnings.

```ts
static override behaviors = [behaviors.flash({ interval: 60 })];

hurt() {
  this.behavior<Flash>('flash')!.start(1000);
}
```

| Option      | Default | Meaning                                        |
| ----------- | ------- | ---------------------------------------------- |
| `interval`  | `80`    | On/off period in ms.                           |
| `autoStart` | none    | Start flashing for this many ms when attached. |

`start(ms)` flashes for that long, `flashing` is `true` meanwhile, `remaining` is the time left in ms. The object is visible again when it ends.

## Example

<LiveExample src="behaviors/flash" hint="Touch a red spike with the arrows, or click the hero." />
