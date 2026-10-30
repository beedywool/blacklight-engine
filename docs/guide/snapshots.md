# Snapshots

`scene.snapshot()` captures the state of a scene; `scene.restore(snapshot)` returns the scene to it. Rollback netcode uses them to rewind and replay steps, saves use them to write a level's state to disk, and tests use them to compare runs.

```ts
const before = this.snapshot();
// ... play some steps
this.restore(before);
```

<LiveExample src="concepts/snapshots" hint="Enter takes a snapshot of the scene, Backspace goes back to it. Click to add balls in between." />

## What is saved

| Part         | Content                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene        | Name, `steps`, the next object id.                                                                                                                                                                |
| Random       | The state of `scene.random`, so the same numbers come out after a restore.                                                                                                                        |
| Cameras      | Number of cameras; `x`, `y`, `zoom`, `rotation`, `viewport`, `bounds` and follow target (by object id) of each.                                                                                   |
| Each object  | `id`, registry name, parent object or draw layer.                                                                                                                                                 |
| Core fields  | `x`, `y`, `rotation`, `scale`, `alpha`, `visible`, `zIndex`, `velocity`, `player`, `tags`, `hitbox`, `collision`.                                                                                 |
| Engine state | `Text`: `text`. `Sprite`: `flipX`, `flipY`. `TilemapLayer`: the map, with tiles changed by `setTile`. `Particles`: options and `emitting`. `Video`: `source`, `loop`, `muted`, playback position. |
| Data fields  | Every field the game's class declares (`hp = 3`, `coins = 0`, `target = null`), or only those listed in `static serialize`.                                                                       |
| Behaviors    | `enabled` and every data field of each behavior (`facing`, `onGround`, `direction`, timers in ms…).                                                                                               |
| Animation    | For sprites: animation name, frame index, time in the frame, `finished`, mirrored fallback, speed.                                                                                                |
| Timers       | Scene and object timers, and current collision contacts, in memory only (see below).                                                                                                              |

Data fields are the fields a class adds on top of the engine's: the engine records which fields exist after its own constructor, and the rest belong to the game. To save only some of them:

```ts
export default class Enemy extends Sprite {
  static override serialize = ['hp', 'target'];
  hp = 3;
  target: Player | undefined;
  path: Point[] = []; // recomputed, not saved
}
```

## Values and references

Field values are encoded so the snapshot is plain JSON:

| Value                                    | Saved as                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| Numbers, strings, booleans, `null`       | Themselves.                                          |
| Arrays and plain objects                 | Copies, encoded recursively (32 levels).             |
| `Map`, `Set`                             | `{ $map: [...] }`, `{ $set: [...] }`.                |
| `Vector2`                                | `{ $v: [x, y] }`.                                    |
| A game object                            | `{ $ref: id }`, restored as the object with that id. |
| `undefined` (a field's own value)        | `{ $undefined: true }`, restored as `undefined`.     |
| Functions, class instances, Pixi objects | Left out.                                            |

A reference to another object survives a restore even when the object was destroyed and re-created: it points to the new instance with the same id. A field whose value is left out (a function, a class instance) keeps its current value on restore. Inside arrays and objects, `undefined` is dropped like in `JSON.stringify`.

## Restoring

`restore(snapshot)`:

1. destroys the objects that did not exist in the snapshot;
2. re-creates the objects that were destroyed since, by registry name, under the same parent or layer, without calling `create()`;
3. writes every saved field back and places each object with `teleport` (no interpolation from the current position), then calls `onRestore()` on the re-created objects, then restores behaviors, animations, the random state, cameras (adding or removing cameras to match) and steps;
4. restores the timers when the snapshot holds them.

Objects that still exist keep their identity: references held outside the scene stay valid. A snapshot of another scene throws (`This snapshot is of scene "level"; it cannot be restored into "title".`).

### `onRestore`

A re-created object does not run `create()`, which would spawn children or reset fields a second time. It gets `onRestore()` instead, after its saved fields and engine state are back. Put there what `create()` builds that is not saved: display objects, listeners, references to scene objects found by name.

```ts
export default class Door extends Sprite {
  open = false;

  override create() {
    this.setup();
  }

  override onRestore() {
    this.setup();
  }

  private setup() {
    this.play(this.open ? 'open' : 'closed');
    this.listen(this.scene.events, 'lever', () => (this.open = !this.open));
  }
}
```

`TilemapLayer`, `Particles` and `Video` implement `onRestore` to reload their map, emitter settings and video file.

## Saving to disk

Everything in a snapshot is JSON-safe except `memory`, which holds the scene and object timers with their callbacks. It is valid only in the same session, for rollback. Remove it before writing:

```ts
const { memory, ...save } = this.snapshot();
localStorage.setItem('slot-1', JSON.stringify(save));

// later, in the same scene
this.restore(JSON.parse(localStorage.getItem('slot-1')!));
```

A snapshot restored without `memory` leaves the scene's current timers as they are. Game logic that must survive a save should not live in timers alone: keep a field (`respawnAt = this.steps + 120`) and test it in `update()`.

## Uses

- **Rollback**: snapshot every step, and when a late input arrives, restore the step it belongs to and run the steps again. `@blacklight/net` does this for online games ([Networking](./networking)). Snapshots, the fixed step and the seeded random generator are what make the replay identical; a restore also puts objects back in their update order and gives objects spawned afterwards the same ids as the first time.
- **Saves and checkpoints**: write the JSON part, restore it when the player continues.
- **Tests**: run a scene, snapshot, run again from the snapshot, compare.

## Limits

- Not saved: tweens, sounds and music, overlays, the camera's shake, the shapes drawn on a `Graphics`, a `Text`'s `style`, particles already alive, and fields of the `Scene` subclass itself. Keep scene-wide state on an object, or restore it by hand after `restore`.
- A re-created `Graphics` is empty; draw again in `onRestore` (a subclass of `Graphics` can do it).
- A re-created `Video` starts at the beginning, paused.
- Timers are kept in memory only, never in JSON.
- Rapier bodies from `@blacklight/physics` are not saved; restoring moves the objects, not their bodies.
