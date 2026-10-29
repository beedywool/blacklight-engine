# Scenes

A scene is a class that extends `Scene`, default-exported from `scenes/<name>/<name>.scene.ts`. It owns the objects of one screen of the game (a title screen, a level, a battle) and their camera, timers, tweens, events, collisions and random generator; all of them end with the scene.

```ts
import { Scene, Text } from '@blacklight/core';
import Player from '@objects/player/player.object';

export default class Level extends Scene {
  static override assets = ['@assets/music/level'];
  static override layers = ['background', 'main', 'effects'];
  player!: Player;

  override create() {
    this.player = this.spawn(Player, { x: 320, y: 540 });
    this.spawn(Text, {
      layer: 'hud',
      x: this.width / 2,
      y: 48,
      text: 'Level 1',
      style: { fill: 0xffffff, fontSize: 48 },
    });
    this.camera.follow(this.player);
    this.audio.music('level', { fade: 800 });
  }

  override update() {
    if (this.input.pressed('pause')) void this.game.overlay('pause');
  }
}
```

## Lifecycle

| Method           | When                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create(params)` | Once, when the scene starts, with the parameters given to `goto`. Its files are already loaded. It may be `async`; the scene starts updating when it resolves.                                 |
| `update()`       | At every logic step (`tickRate`, 60 Hz by default), before the objects update. Game logic goes here.                                                                                           |
| `render(alpha)`  | Once per displayed frame, after the logic steps. `alpha` (0 to 1) is how far the display is between the last step and the next; use it to smooth custom movement on high refresh-rate screens. |
| `destroy()`      | When the scene stops. Its objects, timers, tweens, listeners and display are destroyed after it returns.                                                                                       |

The logic step is fixed so that a game behaves the same at 30, 60 or 144 frames per second. After a stall (a tab in the background, a breakpoint) the engine runs at most five steps to catch up and drops the rest, instead of freezing to replay every missed step. One step of a scene runs scene timers, `update()`, then each object (behaviors, `update()`, velocity, animation, object timers), then collisions, tweens and cameras. See [Time and events](./time-and-events).

## Scene settings

| Static   | Default         | Meaning                                                                                                                                                           |
| -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assets` | none            | Files loaded before `create()`, relative to the scene folder. A path ending with `/` loads a whole folder.                                                        |
| `layers` | `['main']`      | Draw layers of the world, back to front. Objects without `layer` go to `'main'` when listed, else to the first one (`scene.defaultLayer`). `'hud'` always exists. |
| `size`   | the design size | `{ width, height }` of the world: bounds for `onLeave` and the screen behaviors, and the default camera bounds. Without it the camera has no bounds.              |

Every file under `scenes/<name>/assets/` is loaded before the scene starts, with or without `static assets`; so are the sprite sheets of every object class the scene can spawn. See [Assets](./assets#preloading).

## Spawning and finding objects

```ts
const coin = this.spawn(Coin, { x: 200, y: 300 });
this.spawn('Shadow', { x: 900, y: 540, layer: 'effects' });
const hero = this.find('Hero');
const enemies = this.findAll('enemy');
```

| Method                           | Meaning                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `spawn(Type, props)`             | Creates an object (class or registered name), applies `props`, adds it and calls its `create()`. |
| `spawnMany(Type, count, props)`  | Spawns `count` objects; `props(index)` gives each one's props.                                   |
| `add(object, { layer, parent })` | Adds an object created with `new`.                                                               |
| `find(what)`, `findAll(what)`    | First or every living object with that registry name, tag or class.                              |
| `byId(id)`                       | Object with that id.                                                                             |
| `objects`                        | Every living object, in spawn order.                                                             |
| `layer(name)`                    | The Pixi container of a draw layer.                                                              |

Names defined in the scene's own `objects/` folder shadow global ones. See [Objects](./objects).

## Switching scenes

```ts
await this.goto('battle', { enemy: 'shadow' });
await this.goto('title', undefined, { transition: 'fade' });
```

`goto(name, params, options)` stops the current scene and its overlays, loads the next one (its code chunk and files are downloaded the first time) and calls its `create` with the parameters. Calls made while a switch is in progress wait for it. An unknown name throws an error with the closest scene names, so `goto('batle')` says `Did you mean "battle"?`. Scene names are typed from the project (see [Assets](./assets#generated-types)), so the typo is caught by the editor first.

Type the parameters with the class's type argument:

```ts
export default class Battle extends Scene<{ enemy: string }> {
  override create({ enemy }: { enemy: string }) {
    // ...
  }
}
```

### Transitions

`transition: 'fade'` fades to black over 250 ms, switches, and fades back in over 250 ms. `'none'` (the default) switches at once. A custom transition is an object with a `duration` in ms (real time, for each half) and a `draw` function called every frame with a container to draw in, a `progress` that goes from 0 to 1 while covering then from 1 to 0 while revealing, and the design size:

```ts
import type { Transition } from '@blacklight/core';
import { Graphics } from 'pixi.js';

const wipe: Transition = {
  duration: 400,
  draw(layer, progress, size) {
    const bar = (layer.children[0] as Graphics | undefined) ?? layer.addChild(new Graphics());
    bar
      .clear()
      .rect(0, 0, size.width * progress, size.height)
      .fill(0x080808);
  },
};

await this.goto('results', undefined, { transition: wipe });
```

The container is emptied after the transition. Drawing uses Pixi directly: add `pixi.js` to the game's dependencies, at the version `@blacklight/core` uses, to import it.

A transition can also be registered under a name in `game.transitions` (a `Map`) and used by name: `goto('results', undefined, { transition: 'wipe' })`. `@blacklight/ui` registers its whole [transition library](./ui-transitions) there (`iris`, `ink`, `shatter`, `slices`, `wipe`, `zoom`, `distort`…), drawn over the canvas and the screens; an unknown name throws with the closest known names.

### Loading

While a scene loads after the first one, a thin progress bar is drawn at the bottom of the screen, and `game.events` emits `loading` with `{ scene, progress }`. `game.preload(name)` loads a scene ahead of time, so the next `goto` to it starts at once.

## Overlays

An overlay is a scene opened over the current one: pause menus, dialogs, inventories.

```ts
// in the level
if (this.input.pressed('pause')) void this.game.overlay('pause');

// in scenes/pause/pause.scene.ts
override update() {
  if (this.input.pressed('back')) this.game.closeOverlay(this);
}
```

`game.overlay(name, params, { pauseBelow })` loads and starts the scene above the others and returns it. With `pauseBelow` (the default `true`) the scenes under it stop updating but keep drawing; with `false` they keep running. `game.closeOverlay(scene?)` closes one overlay, the top one by default. `game.overlays` lists them, bottom first. `goto` closes every overlay.

## Hosted scenes

A scene can run another scene inside a rectangle of its HUD: a mini-game in a match shell, a preview window, a picture-in-picture.

```ts
const game = await this.hostScene(
  'air-hockey',
  { x: 160, y: 120, width: 1600, height: 840 },
  { goals: 5 },
);
// later
this.closeHosted(game);
```

`hostScene(name, rect, params)` starts the scene with its own objects, camera, timers and random generator, clipped to `rect` (virtual pixels of the host's screen space). It is updated and drawn with its host and stops with it. Inside the hosted scene, `width` and `height` are the rectangle's size, `pointer` is relative to the rectangle, `host` is the hosting scene and `hostRect` the rectangle. `hosted` lists a scene's hosted scenes.

## Cameras

Each scene has a main camera, `this.camera`, and can add up to three more for split screen with `addCamera`. See [Camera](./camera).

## Saving the state

`snapshot()` captures every object, the random state and the cameras; `restore(snapshot)` returns to it. See [Snapshots](./snapshots).

## Inside a scene

| Member                                                  | Meaning                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `this.game`                                             | The running game: `config`, `goto`, `overlay`, `pause`, `time`, `settings`, `assets`.              |
| `this.name`                                             | Scene name (its folder).                                                                           |
| `this.width`, `this.height`                             | Design size in virtual pixels (the host rectangle for hosted scenes).                              |
| `this.bounds`                                           | World rectangle from `static size`, used by `onLeave`.                                             |
| `this.input`                                            | Input; see [Input](./input).                                                                       |
| `this.pointer`                                          | Mouse or touch position in world coordinates, with `screen`, `down`, `pressed`, `released`.        |
| `this.ui`                                               | Screens of the scene (`open`, `push`, `pop`, `replace`, `closeAll`); see [UI layer](./ui).         |
| `this.audio`                                            | `play`, `music`, `stopMusic`, with keys looked up in the scene folder first; see [Audio](./audio). |
| `this.camera`, `this.cameras`                           | Main camera and every camera.                                                                      |
| `this.events`                                           | Scene event bus, cleared when the scene ends.                                                      |
| `this.after`, `this.every`, `this.tween`, `this.listen` | Timers, tweens and listeners that end with the scene.                                              |
| `this.random`                                           | Seeded random generator of the scene.                                                              |
| `this.steps`                                            | Steps run since `create()`.                                                                        |
| `this.raycast`, `this.query`, `this.collisions`         | Collision queries; see [Collisions](./collisions).                                                 |
| `this.stage`                                            | Root display container: the world (moved by the camera) and the HUD.                               |
| `this.world`, `this.hud`                                | The camera-moved container holding the layers, and the screen-space container.                     |

## Limits

- Transitions run on real time, not game time: `time.scale` does not slow them.
- An overlay with `pauseBelow` stops the scenes below; their sounds keep playing.
- Hosted scenes always draw inside the host's HUD, above the host's world.
- The first scene loads without a progress bar: the canvas stays black until it is ready.
