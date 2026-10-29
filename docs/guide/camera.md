# Camera

A camera shows part of a scene's world. Every scene has one, `this.camera`; `camera.x` / `camera.y` is the world point at the center of the view. It starts centered on the design area, so a scene that fits the screen needs no camera code.

```ts
override create() {
  this.player = this.spawn(Player, { x: 200, y: 800 });
  this.camera.follow(this.player, { lerp: 0.1, deadzone: { width: 200, height: 120 } });
  this.camera.bounds = { x: 0, y: 0, width: 4000, height: 1080 };
}
```

The camera moves the world layers. The `'hud'` layer is drawn in screen space above them and ignores the camera: scores, health bars and on-screen controls go there.

```ts
this.spawn(Text, { layer: 'hud', x: 32, y: 32, text: 'Score 0' });
```

## Following

`follow(target, options)` moves the camera towards `target` every step until `unfollow()`. The target is any object with `x` and `y`; a destroyed object stops being followed.

| Option     | Default | Meaning                                                                                                 |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `lerp`     | `0.15`  | Share of the remaining distance covered each step: `1` locks onto the target, `0.05` trails far behind. |
| `deadzone` | none    | `{ width, height }` around the view center where the target moves without moving the camera.            |
| `offset`   | none    | `{ x, y }` added to the target position: look ahead, look up.                                           |

`centerOn(x, y)` jumps to a point now (within the bounds).

## Bounds

`camera.bounds = { x, y, width, height }` keeps the view inside a world rectangle, so the edges of a level are never passed. A scene with `static size` starts with bounds of `{ x: 0, y: 0, ...size }` on every camera; without it, cameras have no bounds. When the bounds are smaller than the view on an axis, the camera centers on them on that axis. `camera.view` is the visible world rectangle, `viewWidth` / `viewHeight` its size. They use the area actually visible on screen, so in `extend` mode on a wide screen the view is wider than the design size and the bounds still hold at its edges.

## Shake

```ts
this.camera.shake(8, 300);
```

`shake(intensity, duration = 250)` moves the view randomly by up to `intensity` world pixels, fading out over `duration` ms. A new shake during another keeps the stronger of the two. The offset is applied when drawing only: `camera.x` / `camera.y` do not change. The shake draws from a cosmetic generator seeded from the scene's, so it replays identically and does not change the numbers `scene.random` gives game logic.

## Zoom and rotation

```ts
this.tween(this.camera, { zoom: 2 }, { duration: 600, ease: 'easeInOut' });
this.camera.rotation = 0.05;
```

`zoom` scales the world around the view center (2 shows half as much). `rotation` turns the view, in radians. Both are plain fields, so tweens animate them.

## Converting coordinates

```ts
const world = this.camera.toWorld({ x: 100, y: 100 });
const screen = this.camera.toScreen({ x: enemy.x, y: enemy.y });
```

`toWorld(point)` turns a point in virtual pixels of the design area (screen space) into world coordinates; `toScreen(point)` does the reverse. Both account for zoom, rotation and the camera's viewport, not for shake. `scene.pointer` is already in world coordinates through the main camera.

## Split screen

```ts
override create() {
  this.camera.viewport = { x: 0, y: 0, width: 0.5, height: 1 };
  this.camera.follow(this.p1);
  const right = this.addCamera({ x: 0.5, y: 0, width: 0.5, height: 1 });
  right.follow(this.p2);
}
```

`addCamera(viewport)` adds a camera drawing to part of the screen; `viewport` is in fractions of the design size (`{ x: 0, y: 0, width: 0.5, height: 1 }` is the left half). A scene has at most 4 cameras; a fifth throws. With more than one camera, each one renders the world into its own texture. `scene.cameras` lists them, `scene.camera` is the first, and `removeCamera(camera)` removes one (never the last). The HUD is drawn once, over the whole screen.

Each camera has its own `follow`, `bounds`, `zoom`, `rotation` and `shake`. Its view size at zoom 1 is the visible size times its viewport fraction.

## Limits

- `lerp` and `shake` are applied per fixed step: changing `tickRate` changes how fast the camera catches up.
- `scene.pointer`, positioned sound and the [`pointer` behavior](./behaviors#pointer) use the main camera only.
- Bounds from `static size` are copied when each camera is created; to change them later, set `camera.bounds`.
