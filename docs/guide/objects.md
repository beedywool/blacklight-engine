# Objects

Everything placed in a scene is a game object: a class that extends `GameObject` or one of the built-in objects (`Sprite`, `Text`, `Graphics`, `Container`, `Video`, `Particles`, `TilemapLayer`). A project object lives in `objects/<name>/<name>.object.ts` (or `scenes/<scene>/objects/<name>/` when one scene uses it) and is the default export of that file. Its registry name is the folder name in PascalCase: `objects/big-enemy/` is `BigEnemy`.

```ts
import { Sprite, behaviors, type GameObject } from '@blacklight/core';
import anims from './hero.anim.json';

export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [behaviors.eightDirections({ speed: 90 })];
  coins = 0;

  override update() {
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
  }

  override onCollide(other: GameObject) {
    if (!other.is('Coin')) return;
    other.destroy();
    this.coins++;
  }
}
```

`GameObject` extends a Pixi `Container`, so `rotation`, `scale`, `alpha`, `visible`, `zIndex` and `addChild` work as in Pixi. Positions are in virtual pixels, speeds in virtual pixels per second, angles in radians unless an option says degrees.

<LiveExample src="concepts/objects" hint="Objects: a container with children, layers and z-order, alpha, tint and a Pixi filter." />

::: tip Tutorial
The [objects tutorial](../tutorials/objects) has exercises to do in the page: spawn with properties, update every step, attach children.
:::

## Spawning

```ts
const hero = this.spawn(Hero, { x: 60, y: 100 });
this.spawn('Coin', { x: 120, y: 100 });
this.spawn(Shadow, { x: 900, y: 540, layer: 'enemies', scale: 2, hp: 5 });
const coins = this.spawnMany(Coin, 3, (i) => ({ x: 120 + i * 30, y: 100 }));
```

`spawn(Type, props)` creates the object, applies `props`, adds it to the scene and calls its `create()`. `Type` is a class or a registered name; a name defined in the current scene's `objects/` folder shadows a global one. An unknown name throws with the closest names.

Props are any public field of the object, plus:

| Prop       | Meaning                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `layer`    | Scene layer to add the object to. Default: `'main'` when the scene declares it, else the first entry of `static layers`. |
| `parent`   | Another object: the new object becomes its child and moves with it.                                                      |
| `scale`    | A number (uniform) or `{ x, y }`.                                                                                        |
| `velocity` | `{ x, y }`, copied into the object's `velocity` vector.                                                                  |

An object created with `new` joins a scene through `this.add(object, { layer, parent })`. `spawn` is the usual way: it applies props before `create()` runs and before behaviors attach.

## Position and interpolation

Game logic runs at a fixed step (60 Hz by default); the display runs at the screen's rate. Between two steps the engine draws each object between its previous and its current position, so movement stays smooth on a 144 Hz screen.

- `x` / `y` and Pixi's `position` are the same logical position: `this.position.set(100, 50)`, `this.position.x = 100` and `this.x = 100` all move the object, and the object slides there from where it was at the previous step.
- `teleport(x, y)` moves without interpolation: the object appears at the new place instead of sliding there during one frame. Use it for respawns, portals, screen wraps and clicks that place something.
- Only the position is interpolated. `rotation`, `scale` and `alpha` show their step value.
- With `resolution.pixelArt`, the drawn position is rounded to whole pixels.
- The drawn, in-between position stays inside Pixi: `localTransform` and `toGlobal()` give it after a frame is drawn. Game logic reads `x` / `y`.

`velocity` is applied every step through `move()`, so an object with a hitbox stops at solids. A behavior that moves the object itself (`ownsMovement`) turns this off; see [Behaviors](./behaviors).

## Lifecycle

| Method                      | When                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `create()`                  | Once, after spawn props are applied, behaviors attached and the sprite sheet set.       |
| `update()`                  | At every fixed step, after the object's behaviors and before `velocity` is applied.     |
| `onDestroy()`               | When the object is destroyed, before its behaviors detach and its timers stop.          |
| `onCollide(other, contact)` | When it starts overlapping another object. See [Collisions](./collisions).              |
| `onCollideEnd(other)`       | When it stops overlapping `other`.                                                      |
| `onLeave(side)`             | When it goes fully outside the scene bounds (`'left'`, `'right'`, `'top'`, `'bottom'`). |

One step of the scene runs in this order: scene timers, the scene's `update()`, then each object (behaviors, `update()`, `velocity`, animation, object timers), then collisions (`onCollide`, `onCollideEnd`, `onLeave`), tweens and cameras.

`destroy()` removes the object and its children from the scene. It is safe to call twice; `alive` is `false` afterwards. Code that keeps a reference to an object checks `alive` before using it.

## Identity

| Member       | Meaning                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`         | Number unique within the scene, given at spawn, kept by [snapshots](./snapshots).                                              |
| `objectName` | Registry name of the class (`'Hero'`).                                                                                         |
| `tags`       | A `Set<string>`. `static tags = ['enemy']` gives every instance its tags.                                                      |
| `is(what)`   | `true` when the object has that tag, its class (or a parent class) has that registry name, or it is an instance of that class. |
| `player`     | Local player number (1 to 8) whose input `this.input` reads. Default `1`.                                                      |

```ts
if (other.is('enemy')) this.hurt();
const boss = this.scene.find('Boss');
const enemies = this.scene.findAll(Enemy);
const same = this.scene.byId(12);
```

`scene.find` and `scene.findAll` accept the same names, tags and classes as `is()`.

## Timers, tweens and listeners

Timers and listeners created through the object stop when it is destroyed:

```ts
this.after(500, () => this.flash());
const stop = this.every(1000, () => this.score++);
await this.tween({ y: this.y - 40, alpha: 0 }, { duration: 400 }).finished;
this.listen(this.game.events, 'pause', () => this.freeze());
```

`after` and `every` count game time: they pause with the game and follow `game.time.scale`. `tween` animates numeric fields of the object (`x`, `alpha`, `'scale.x'`) on the scene clock and stops if the object is destroyed. See [Time and events](./time-and-events).

## Moving with collisions

```ts
const result = this.move(dx, dy);
if (result.blockedX) this.turnAround();
```

`move(dx, dy, climb)` moves by up to one pixel at a time and stops at solid objects and solid tiles. It returns `blockedX`, `blockedY` and `touched` (the solid objects hit). `climb` lets the object walk up slopes: pixels up per pixel sideways. Setting `x` / `y` directly ignores solids. See [Collisions](./collisions).

## Hitbox and collision settings

```ts
export default class Coin extends Sprite {
  static override hitbox = { type: 'circle' as const, radius: 6 };
  static override collision = { layer: 'pickup' };
}
```

| Static      | Default                                         | Meaning                                                            |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------ |
| `hitbox`    | `'none'` (`'auto'` for `Sprite` and `Graphics`) | Collision shape in local space.                                    |
| `collision` | `{}`                                            | `layer`, `mask`, `solid`, `jumpThru`, `blockedBySolids`, `events`. |
| `behaviors` | none                                            | Behaviors every instance gets.                                     |
| `tags`      | none                                            | Tags every instance gets.                                          |
| `assets`    | none                                            | Extra files to preload with the object, relative to its folder.    |
| `serialize` | every data field                                | Fields saved by snapshots.                                         |

Each instance copies `hitbox` and `collision` from its class, so `wall.collision.solid = true` changes one object. Shapes and options are described in [Collisions](./collisions).

## Children

```ts
const sword = this.scene.spawn(Sword, { parent: this, x: 12, y: -4 });
```

A child's `x` / `y` are relative to its parent. It moves, rotates, scales and fades with the parent, is destroyed with it, and never collides with it. Each child still runs its own behaviors and `update()`.

## Layers

A scene draws its objects in layers, back to front:

```ts
export default class Level extends Scene {
  static override layers = ['background', 'main', 'enemies', 'effects'];
}
```

`spawn(Type, { layer: 'effects' })` picks the layer; without `layer` the object goes to `'main'` when the list contains it, else to the first layer of the list (`scene.defaultLayer`). `'hud'` is always available: objects in it are drawn in screen space, above the world, and ignore the camera. Inside a layer, `zIndex` orders objects. An unknown layer name throws with the closest names.

## Built-in objects

### Sprite

An image or an animated sprite sheet. See [Sprites and animations](./sprites-and-animations).

### Text

```ts
const score = this.spawn(Text, {
  x: 16,
  y: 16,
  layer: 'hud',
  text: '0',
  style: { fontFamily: 'pixellita', fontSize: 32, fill: 0xffffff },
});
score.anchor.set(0, 0);
score.text = String(points);
```

`text` accepts a string or a number. `style` takes Pixi `TextStyleOptions`. The anchor is centered by default.

Web fonts: every `.woff2`, `.woff`, `.ttf` or `.otf` under `assets/` is loaded before the first scene, and its family name is the file name without extension (`assets/fonts/pixellita.woff2` is `fontFamily: 'pixellita'`). Fonts in a scene's `assets/` folder load with that scene. Text is redrawn at the screen's resolution, so it stays sharp when the game is scaled up.

Bitmap fonts: an AngelCode `.fnt` file (text or XML) and its page images. A `.fnt` under `assets/` is loaded before the first scene, like web fonts; one in a scene's `assets/` folder (or `static assets`) loads with that scene. Its pages load with it. Then draw with the font's face name as `fontFamily`:

```ts
class ScoreText extends Text {
  static override bitmap = true;
}

this.spawn(ScoreText, { text: '000', style: { fontFamily: 'Arcade', fontSize: 16 } });
// or, for one instance:
this.spawn(Text, { bitmap: true, text: '000', style: { fontFamily: 'Arcade', fontSize: 16 } });
```

`static bitmap` makes every instance of a class use bitmap fonts; the `bitmap` field switches one instance, at spawn or later (the text, style and anchor are kept). A bitmap text with a web font family that has no `.fnt` makes Pixi generate a bitmap font from it.

<LiveExample src="concepts/text" hint="Text objects: Pixi text styles, anchors, and a text updated every step." />

### Graphics

Vector shapes drawn with the Pixi Graphics API on `draw`:

```ts
const wall = this.spawn(Graphics, { x: 240, y: 60 });
wall.draw.rect(0, 0, 16, 80).fill(0x8e8e8e);
wall.collision.solid = true;
```

The hitbox is `'auto'`: the bounds of what is drawn, read every time collisions are checked.

### Container

An empty object that groups others. Move, rotate or fade the container and its children follow.

```ts
const panel = this.spawn(Container, { x: 400, y: 300 });
this.spawn(Icon, { parent: panel, x: -40 });
this.spawn(Label, { parent: panel, x: 40 });
```

### Video

```ts
const intro = this.spawn(Video, { source: 'intro', loop: true });
await intro.play();
```

| Field    | Default     | Meaning                                                                 |
| -------- | ----------- | ----------------------------------------------------------------------- |
| `source` | `undefined` | Video key or path. Every format of that name is offered to the browser. |
| `loop`   | `false`     | Loop playback.                                                          |
| `muted`  | `true`      | Browsers only autoplay muted video; unmute after a user gesture.        |

`load(source)` sets another file, `play()` returns the browser's play promise, `pause()` pauses, `ended` reports the end, and `element` is the `HTMLVideoElement`. The video starts paused. MP4 (H.264) plays everywhere; WebM (VP9) with transparency plays on desktop and Android. QuickTime `.mov` is accepted too (Safari plays it; other browsers depend on the codec inside). Put several files next to each other (`intro.mp4`, `intro.webm`) and the browser picks the first it can play.

### Particles

```ts
const sparks = this.spawn(Particles, { x: 320, y: 200 });
sparks.configure({ rate: 0, speed: [120, 260], tint: [0xffd60a, 0xff5500], additive: true });
sparks.burst(40);
```

Options are set with the `options` spawn prop or `configure(options)`, which replaces them all. `burst(count)` emits at once, `emitting` turns continuous emission on and off, `count` is the number of living particles. A range is a number or `[min, max]`; values are drawn from the scene's seeded random generator, so effects replay the same way.

| Option     | Default        | Meaning                                                          |
| ---------- | -------------- | ---------------------------------------------------------------- |
| `texture`  | soft white dot | Particle image (key or path).                                    |
| `rate`     | `20`           | Particles per second while emitting.                             |
| `lifetime` | `[600, 1000]`  | Lifetime in ms.                                                  |
| `speed`    | `[60, 120]`    | Initial speed in px/s.                                           |
| `angle`    | `[0, 360]`     | Emission direction in degrees (0 right, 90 down).                |
| `gravity`  | none           | Acceleration `{ x, y }` in px/s².                                |
| `scale`    | `[1, 1]`       | Scale at birth and at death.                                     |
| `alpha`    | `[1, 0]`       | Alpha at birth and at death.                                     |
| `tint`     | none           | One color, or `[birth, death]`.                                  |
| `spin`     | `0`            | Rotation speed in degrees per second.                            |
| `area`     | point          | Spawn area around the emitter: a radius, or `{ width, height }`. |
| `max`      | `500`          | Most particles alive at once.                                    |
| `additive` | `false`        | Additive blending for glows and sparks.                          |
| `emitting` | `true`         | Emit as soon as spawned.                                         |

Particles are children of the emitter: moving the emitter moves the particles already emitted. For a trail, spawn an emitter that stays in place, or burst from short-lived emitters.

<LiveExample src="concepts/particles" hint="A fountain emits continuously; click to burst sparks where you click." />

### TilemapLayer

A grid of tiles from one tileset image. Tiles are drawn in cached 16×16 chunks; solid tiles block `move()`, behaviors and raycasts.

```ts
import level from './level-1.tilemap.json';

const ground = this.spawn(TilemapLayer, { map: level });
ground.setTile(4, 10, 0); // dig a hole
```

`.tilemap.json` files are imported as modules. The tileset image is a normal asset and must be loaded with the scene (put it in the scene's `assets/` folder).

`TilemapData`:

| Field             | Meaning                                                                            |
| ----------------- | ---------------------------------------------------------------------------------- |
| `tileset`         | The `Tileset` below.                                                               |
| `columns`, `rows` | Size in tiles.                                                                     |
| `tiles`           | Row-major tile numbers, `columns × rows` long. `0` is an empty cell.               |
| `solid`           | Every non-empty tile blocks movement, unless `tileset.solid` lists the solid ones. |

`Tileset`:

| Field                     | Meaning                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `image`                   | Tileset image, key or path.                                                                        |
| `tileWidth`, `tileHeight` | Tile size in pixels.                                                                               |
| `margin`, `spacing`       | Pixels around the image and between tiles. Default `0`.                                            |
| `solid`                   | Tile numbers that are solid. When present, it decides alone (the layer's `solid` flag is ignored). |
| `jumpThru`                | Tile numbers solid from above only (one-way platforms).                                            |
| `shapes`                  | Non-rectangular solid tiles (slopes): tile number → polygon points in tile pixels.                 |
| `animated`                | Tile number → `{ frames: number[], fps }`.                                                         |

Tile numbers start at 1 for the top-left tile of the image and go left to right, top to bottom. A slope is a solid tile with a polygon:

```ts
shapes: { 7: [[0, 16], [16, 0], [16, 16]] } // rises to the right
```

Methods: `load(map)` shows another map, `getTile(column, row)` and `setTile(column, row, tile)` read and change a cell (the chunk is redrawn), `cellAt(x, y)` gives the cell under a scene point. `tileWidth`, `tileHeight`, `columns` and `rows` describe the loaded map.

`TilemapLayer.fromTiled(map, layerName, image)` converts one tile layer of a [Tiled](https://www.mapeditor.org) JSON map. Tiles with a boolean `solid` or `jumpThru` custom property and Tiled tile animations carry over. The image is given as a key or path; the path stored by Tiled is ignored.

```ts
import tiled from './level-1.json';

const data = TilemapLayer.fromTiled(tiled, 'ground', 'tiles');
this.spawn(TilemapLayer, { map: data });
```

<LiveExample src="concepts/tilemap" hint="A tilemap defined in code: grey and red tiles are solid, the lights are animated. Arrows move. Click a cell to dig or fill it." />

## Limits

- Only `x` and `y` are interpolated between steps; rotation, scale and alpha change once per step.
- Particles move with their emitter.
- `TilemapLayer` uses one tileset per layer. `fromTiled` reads the first tileset of the map, ignores flipped and rotated tile flags, and does not import object layers.
- Without any `solid` property in Tiled, `fromTiled` marks no tile solid: set `solid: true` on the returned data to make every tile solid.
- `cellAt` ignores the layer's rotation.
