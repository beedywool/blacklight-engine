# Scenes

A scene is a class that extends `Scene`, default-exported from `scenes/<name>/<name>.scene.ts`.

```ts
import { Scene, Text } from '@blacklight/core';

export default class Title extends Scene {
  create() {
    const title = this.add(
      new Text({ text: 'Press start', style: { fill: 0xffffff, fontSize: 64 } }),
    );
    title.anchor.set(0.5);
    title.position.set(this.width / 2, this.height / 2);
  }

  update() {
    // fixed step: 60 times per second by default
  }
}
```

## Lifecycle

| Method           | When                                                                                                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(params)` | Once, when the scene starts, with the parameters given to `goto`. It may be `async`; the scene starts updating when it resolves.                                                        |
| `update()`       | At every logic step (`tickRate`, 60 Hz by default). Game logic goes here.                                                                                                               |
| `render(alpha)`  | Once per displayed frame, after the logic steps. `alpha` (0 to 1) is how far the display is between the last step and the next; use it to smooth movement on high refresh-rate screens. |
| `destroy()`      | When the scene stops. Its display objects are destroyed after it returns.                                                                                                               |

The logic step is fixed so that a game behaves the same at 30, 60 or 144 frames per second. After a stall (a tab in the background, a breakpoint) the engine runs at most five steps to catch up and drops the rest, instead of freezing to replay every missed step.

## Switching scenes

```ts
await this.goto('battle', { enemy: 'shadow' });
```

`goto` stops the current scene, loads the next one (its chunk is downloaded the first time) and calls its `create` with the parameters. Calls made while a switch is in progress wait for it. An unknown name throws an error with the closest scene names, so `goto('batle')` says `Did you mean "battle"?`.

Type the parameters with the class's type argument:

```ts
export default class Battle extends Scene<{ enemy: string }> {
  create({ enemy }: { enemy: string }) {
    // ...
  }
}
```

## Inside a scene

| Member                      |                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------- |
| `this.game`                 | The running game: `config`, `viewport`, `goto`.                                 |
| `this.stage`                | The scene's root container. `this.add(child)` adds to it and returns the child. |
| `this.width`, `this.height` | Design size in virtual pixels.                                                  |
| `this.name`                 | Scene name.                                                                     |
