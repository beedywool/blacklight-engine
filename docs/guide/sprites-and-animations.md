# Sprites and animations

A `Sprite` is a game object drawn from an image or a sprite sheet. Its frames and animations come from the object's folder, by convention or from an `.anim.json` file.

```
objects/hero/
├── hero.object.ts
├── hero@16x16.png     grid sheet: 16 × 16 frames
└── hero.anim.json     animations, events, hitbox
```

```ts
import { Sprite, behaviors } from '@blacklight/core';
import anims from './hero.anim.json';

export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [behaviors.eightDirections({ speed: 90 })];

  override update() {
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
    if (this.velocity.x !== 0) this.flipX = this.velocity.x < 0;
  }
}
```

The sheet of every object class a scene can spawn is loaded before the scene starts, so `spawn` shows the first frame at once.

<LiveExample src="concepts/sprites" hint="Arrows or WASD: the hero plays `run` while moving, `idle` otherwise, and counts its steps." />

::: tip Tutorial
The [sprites tutorial](../tutorials/sprites) has exercises to do in the page: play an animation, mirror a sprite, add an animation to `.anim.json`.
:::

## Frame sources

The engine looks for frames in this order:

1. `source` in the class's `.anim.json` (`static animations`), relative to the object folder.
2. `static texture`: one image, by key or path.
3. By convention, in the object's folder:
   - `<name>.aseprite.json` (or `<name>.json`): an Aseprite export. The image is the one named in its `meta.image`, else `<name>.png` next to it.
   - an image named `<name>.png` (a single frame) or `<name>@WxH.png` (a grid sheet), in any image format.

A grid sheet is cut into frames of `W` × `H` pixels, left to right, top to bottom. `hero@16x16+2.png` has a 2-pixel margin around the image and between frames. A single image is one frame.

Without animations declared, an Aseprite sheet gets one animation per tag, and any other sheet gets one animation named `default` with every frame.

A sprite without any source draws nothing and has no animations; `play` on it throws an error that says to add a sheet or an `.anim.json`.

## The `.anim.json` file

```json
{
  "$schema": "../../node_modules/@blacklight/core/schema/anim.schema.json",
  "source": "./hero@16x16.png",
  "default": "idle",
  "fps": 10,
  "hitbox": { "type": "box", "x": -5, "y": -6, "width": 10, "height": 14 },
  "animations": {
    "idle": { "frames": [0, 1], "fps": 2 },
    "run": { "frames": [2, 3], "fps": 8, "events": { "0": "step" } },
    "attack": { "frames": { "from": 4, "to": 7 }, "next": "idle" }
  }
}
```

The `$schema` line points at the schema shipped in `@blacklight/core` (`node_modules/@blacklight/core/schema/anim.schema.json`, relative to the file). With it, VS Code completes and checks the file. Import the file in the object (`import anims from './hero.anim.json'`) and assign it to `static animations`. Editing an `.anim.json` reloads the dev server and regenerates the typed animation names.

File fields:

| Field        | Default           | Meaning                                                                                      |
| ------------ | ----------------- | -------------------------------------------------------------------------------------------- |
| `animations` | required          | Animations by name.                                                                          |
| `source`     | convention        | Aseprite JSON, grid image (`hero@32x32.png`) or single image, relative to the object folder. |
| `fps`        | `10`              | Frame rate of animations that set neither `fps` nor Aseprite durations.                      |
| `default`    | first animation   | Animation played on spawn, and the last fallback for missing names.                          |
| `pivot`      | frame center      | `{ x, y }` in frame pixels: the point placed at the object's position.                       |
| `hitbox`     | object's `hitbox` | Hitbox of every animation (see [Collisions](./collisions)).                                  |

Animation fields:

| Field            | Default                             | Meaning                                                                                  |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `frames`         | tag of the same name, else all      | An Aseprite tag name, a list of frame indices, or `{ "from": a, "to": b }` (inclusive).  |
| `fps`            | Aseprite durations, else file `fps` | Frames per second of this animation.                                                     |
| `loop`           | `true`                              | Start over after the last frame.                                                         |
| `pingPong`       | `false`                             | Play forward then backward (`0 1 2 3 2 1`).                                              |
| `reverse`        | `false`                             | Play the frames in reverse order.                                                        |
| `next`           | none                                | Animation started when this one ends. Implies `loop: false`.                             |
| `events`         | none                                | Frame index within the animation → event name or list of names, received with `onFrame`. |
| `hitbox`         | file `hitbox`                       | Hitbox while this animation plays.                                                       |
| `pivot`          | file `pivot`                        | Pivot while this animation plays.                                                        |
| `frameOverrides` | none                                | Frame index → `{ hitbox, pivot }` for single frames.                                     |

A tag name in `frames` that the sheet does not have, or a frame index outside the sheet, throws when the sheet is built, with the list of tags or the valid range.

## Aseprite

Export with **File → Export Sprite Sheet**, JSON data in Hash or Array format, or from the command line:

```sh
aseprite -b hero.aseprite --sheet hero.png --data hero.aseprite.json --format json-hash --list-tags --list-slices
```

What the engine reads:

- **Frame durations**: used when the animation sets no `fps`.
- **Trim**: trimmed frames are drawn at their place inside the untrimmed frame, so a trimmed export does not jitter. Hitboxes, `hitbox` slices and pivots are measured on the untrimmed frame, as in Aseprite.
- **Flips**: every sprite hitbox (the class's `static hitbox`, `.anim.json` hitboxes, the `hitbox` slice and pixel masks) mirrors with `flipX` / `flipY`.
- **Tags**: become animations when the `.anim.json` declares none, and can be referenced by `frames`. Tag directions `reverse` and `pingpong` apply; `pingPong` in the `.anim.json` overrides the tag's ping-pong. A tag's repeat count plays the tag that many times, then the animation stops (`onEnd` fires); `loop` or `next` in the `.anim.json` overrides it.
- **Slices**: a slice named `hitbox` gives the hitbox of each frame, in frame pixels (a slice key applies from its frame until the next key). A slice with a pivot sets the anchor of the frames it covers.

## Playing animations

| Member                           | Meaning                                                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `play(name, { restart, speed })` | Plays an animation. Calling it every step with the same name keeps it running; `restart: true` starts it over. `speed` multiplies the frame rate and stays until changed.                                                                                        |
| `queue(name)`                    | Plays `name` after the current animation and anything already queued: when a non-looping animation ends (after `onEnd`, instead of its `next`) or a looping one completes its loop. `play` clears the queue.                                                     |
| `onFrame(event, (frame) => …)`   | Listens to `events` from the `.anim.json`. Returns a function that removes the listener.                                                                                                                                                                         |
| `onEnd((name) => …)`             | Called once when a non-looping animation shows its last frame for its full duration, before a queued or `next` animation starts. An animation that `play` replaces before its end does not fire it, like `animationcancel` in CSS; looping animations never end. |
| `flipX`, `flipY`                 | Mirror the image. Hitboxes from the `.anim.json` and the Aseprite `hitbox` slice mirror with it.                                                                                                                                                                 |
| `animation`, `frame`             | Name of the playing animation and frame index within it.                                                                                                                                                                                                         |
| `animationNames`                 | Every animation the sprite has.                                                                                                                                                                                                                                  |
| `anchor`                         | Anchor of the image (0 to 1), `0.5` by default; a pivot overrides it.                                                                                                                                                                                            |
| `setTexture(key)`                | Shows a loaded image and stops the animation.                                                                                                                                                                                                                    |

```ts
override create() {
  this.onFrame('step', () => this.scene.audio.play('footstep'));
  this.onEnd((name) => {
    if (name === 'die') this.destroy();
  });
}

attack() {
  this.play('attack', { restart: true }).queue('idle');
}
```

Animation names are typed: `.blacklight/types.d.ts` lists every animation of every `.anim.json` and every Aseprite tag, so the editor suggests them. Any string is still accepted.

## Directions and fallback

Directional animations end with one of eight facings: `-right`, `-downright`, `-down`, `-downleft`, `-left`, `-upleft`, `-up`, `-upright`. The `facing` of the `eightDirections` and `fourDirections` behaviors uses the same names:

```ts
const move = this.behavior<EightDirections>('eightDirections')!;
this.play(`${this.velocity.length > 0 ? 'walk' : 'idle'}-${move.facing}`);
```

A sheet rarely draws all eight. When `play` gets a name the sprite does not have, it plays the closest one and logs a warning once per name:

1. The horizontal mirror, flipped: `walk-left` plays `walk-right` with the image mirrored.
2. The nearest direction, one step around the compass at a time, each with its mirror: `walk-upleft` plays `walk-up`, or `walk-upright` mirrored.
3. The animation without direction: `walk`.
4. The `default` animation.

When nothing matches and there is no default animation, `play` throws. A mirrored fallback combines with `flipX`: a sprite with `flipX = true` playing a mirrored fallback shows the original orientation.

## Pixel art

`resolution.pixelArt: true` in `game.config.ts` sets nearest-neighbour filtering for every texture, turns antialiasing off, scales the game by whole numbers when the screen is at least the design size, and rounds object and camera positions to whole pixels when drawing. Logic positions keep their fractions; only the display is rounded.

## Limits

- A hitbox from the `.anim.json` (file, animation or frame) takes precedence over the class's `static hitbox`, by design: the file describes the frames.
- Pixel hitboxes (`'pixel'`) follow translation and flips, not rotation.
