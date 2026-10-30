# Time and events

<LiveExample src="concepts/time-and-events" hint="Timers drop a block every 400 ms, tweens animate them, an event counts them. Space: slow motion." />

## Fixed step

Game logic runs in equal steps: `tickRate` per second, 60 by default (see [Configuration](./configuration)). `update()` of scenes, objects and behaviors runs once per step whatever the display rate, so a game behaves the same at 30, 60 or 144 frames per second, and a replay with the same input and seed gives the same result.

Each displayed frame, the engine runs the steps that fit in the elapsed time, then draws. Objects are drawn between their previous and current `x` / `y`, so motion is smooth when the screen refreshes faster than the logic. `render(alpha)` on a scene runs once per frame after the steps; `alpha` (0 to 1) is how far the display is between the last step and the next, for custom interpolation:

```ts
override render(alpha: number) {
  this.beam.x = this.beamPrev + (this.beamX - this.beamPrev) * alpha;
}
```

After a stall (a tab in the background, a breakpoint) the engine runs at most five steps to catch up and drops the rest. With `pauseOnBlur` (the default) the logic stops while the window is hidden or unfocused.

Inside a step, speeds are in pixels per second and behaviors receive `dt` in seconds. `game.time.dt` is `1 / tickRate`.

## Game time

| Field             | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `game.time.step`  | Fixed steps since the game started.                        |
| `game.time.now`   | Game time in ms: `step × dt × 1000`. Stops while paused.   |
| `game.time.dt`    | Seconds per step.                                          |
| `game.time.scale` | Speed of the game clock: `0.5` is slow motion, `1` normal. |
| `scene.steps`     | Steps run since the scene's `create()`.                    |

`time.scale` changes how many steps run per second of real time; each step keeps the same `dt`. At `0.5` the game runs 30 steps per second, so movement, timers, tweens and animations all slow down together and stay deterministic. Values above 1 speed the game up, limited by the five-steps-per-frame catch-up cap.

```ts
this.game.time.scale = 0.3; // bullet time
this.after(500, () => (this.game.time.scale = 1)); // 500 ms of game time
```

`game.pause()` stops the logic (the display keeps drawing) and `game.resume()` restarts it; `game.paused` tells which. They emit `pause` and `resume` on `game.events`. `game.step(n)` runs `n` steps at once, whatever the pause state; see [Debugging](./debugging).

## Timers

```ts
this.after(500, () => this.door.open());
const stop = this.every(1000, () => this.spawnEnemy());
stop(); // cancel
```

`after(ms, callback)` and `every(ms, callback)` exist on scenes and on objects. They count game time, so they pause with the game, slow down with `time.scale` and replay identically. Both return a function that cancels the timer. A scene's timers stop when the scene ends; an object's timers stop when it is destroyed. Several timers due in the same step fire in the order of their due time. `every` needs a positive interval.

Scene timers advance at the start of the step, before the scene's `update()`; object timers advance at the end of the object's step.

## Tweens

```ts
await this.tween(title, { y: 200, alpha: 1 }, { duration: 600, ease: 'backOut' }).finished;
this.coin.tween({ 'scale.x': 1.2, 'scale.y': 1.2 }, { duration: 150, yoyo: true, repeat: 1 });
this.tween(
  button,
  { 'scale.x': 1.1, 'scale.y': 1.1 },
  { ease: { type: 'spring', stiffness: 300 } },
);
```

`scene.tween(target, to, options)` animates numeric properties of any object; `object.tween(to, options)` animates the object itself. Nested properties use dotted paths (`'scale.x'`). Start values are read when the tween starts, after its delay. Tweens run on the scene clock: they pause with the game, follow `time.scale`, and stop when the scene ends or their target object is destroyed.

| Option       | Default     | Meaning                                                |
| ------------ | ----------- | ------------------------------------------------------ |
| `duration`   | `300`       | ms. Ignored by springs.                                |
| `delay`      | `0`         | ms before starting.                                    |
| `ease`       | `'easeOut'` | An ease name, a function from 0–1 to 0–1, or a spring. |
| `repeat`     | `0`         | Extra runs; `Infinity` loops forever.                  |
| `yoyo`       | `false`     | Every other run plays backwards.                       |
| `onUpdate`   | none        | Called each step with the linear progress (0 to 1).    |
| `onComplete` | none        | Called when the tween ends.                            |

Ease names: `linear`, `easeIn`, `easeOut`, `easeInOut`, `backIn`, `backOut`, `backInOut`, `circIn`, `circOut`, `circInOut`, `anticipate`. They come from [Motion](https://motion.dev).

A spring is `{ type: 'spring', stiffness?, damping?, mass? }`: its duration follows from the physics, and it can overshoot the target before settling.

| Tween member | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `finished`   | Promise resolved when the tween completes (not when it is stopped). |
| `stop()`     | Stops where it is.                                                  |
| `complete()` | Jumps to the end values and resolves `finished`.                    |
| `paused`     | `true` holds the tween in place.                                    |
| `progress`   | 0 to 1 within the current run.                                      |
| `done`       | `true` once completed or stopped.                                   |

`scene.tweens.stopTweensOf(target)` stops every tween of one target.

## Random numbers

```ts
const roll = this.random.int(1, 6);
const enemy = this.random.pick(['bat', 'slime', 'ghost']);
if (this.random.chance(0.1)) this.dropItem();
```

`Random` is a seeded generator (sfc32): the same seed gives the same sequence on every browser and device. `game.random` is seeded from `seed` in `game.config.ts`; without `seed`, each run gets a new one. Each scene gets its own generator, `scene.random`, seeded from `game.random` when the scene starts, so a fixed `seed` makes every scene start with a known sequence. Particles draw from `scene.random` too. Camera shake uses a separate cosmetic generator, so shaking the screen does not change the numbers game logic gets.

| Method                | Returns                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `next()`              | Float in [0, 1).                                                         |
| `float(min, max)`     | Float in [min, max).                                                     |
| `int(min, max)`       | Integer in [min, max], both included.                                    |
| `chance(probability)` | `true` with that probability (default 0.5).                              |
| `pick(items)`         | A random element of a non-empty array.                                   |
| `shuffle(items)`      | A shuffled copy.                                                         |
| `seed(seed)`          | Restarts the sequence.                                                   |
| `state`               | Internal state, readable and writable; [snapshots](./snapshots) save it. |

`new Random('level-3')` creates an independent generator, for level generation that must not depend on gameplay.

Use `this.random` in game logic, never `Math.random`: only the seeded generator replays identically and stays in sync in rollback netcode.

## Events

`EventBus` is a typed event emitter. The game has a global bus, `game.events`, and each scene its own, `scene.events`, cleared when the scene ends.

```ts
// in the scene
this.events.emit('scored', 10);

// in an object: listen until it is destroyed
this.listen(this.scene.events, 'scored', (points) => (this.total += points as number));
```

| Method                 | Meaning                                                |
| ---------------------- | ------------------------------------------------------ |
| `on(name, listener)`   | Listens; returns a function that removes the listener. |
| `once(name, listener)` | Listens to the next emission only.                     |
| `off(name, listener)`  | Removes a listener.                                    |
| `emit(name, payload)`  | Calls every listener of `name`.                        |
| `count(name?)`         | Number of listeners.                                   |
| `clear()`              | Removes every listener.                                |

`listen(bus, name, listener)` on a scene or an object registers the listener and removes it when the scene ends or the object is destroyed. A listener added with `on` to a bus that outlives its owner (`game.events`, `input.events`, another object) keeps running and keeps its owner in memory; use `listen` for those.

`scene.events` accepts any event name with an `unknown` payload. For typed events, create a bus with its event map, for example in a module shared by the scenes that use it:

```ts
const events = new EventBus<{ scored: { points: number }; 'game-over': void }>();
events.emit('game-over');
```

`game.events` emits:

| Event     | Payload               | When                                 |
| --------- | --------------------- | ------------------------------------ |
| `scene`   | `{ name }`            | A scene started.                     |
| `loading` | `{ scene, progress }` | Loading progress of a scene, 0 to 1. |
| `step`    | `{ step }`            | After every fixed step.              |
| `pause`   | none                  | `game.pause()`.                      |
| `resume`  | none                  | `game.resume()`.                     |

`input.events` and `audio.events` are described in [Input](./input) and [Audio](./audio).

## Settings

`game.settings` stores player settings on the device: volumes, rebinding, language, accessibility options. Values are JSON and saved at once.

```ts
this.game.settings.set('subtitles', true);
const subtitles = this.game.settings.get<boolean>('subtitles') ?? false;
this.game.settings.delete('subtitles');
```

On the web the store is `localStorage` under `blacklight:<id>:settings`, where `<id>` is the `id` from `game.config.ts`. Audio volumes (`audio.volumes`) and changed bindings (`input.bindings`) live in the same store. In private browsing, or when storage is full, settings last for the session only.

## Limits

- `time.scale` above 1 is capped by the catch-up limit: at 60 Hz and 60 fps, at most 5× speed.
- Timers hold callbacks; they are kept by in-memory snapshots for rollback, not by saves written to disk.
- Settings are not encrypted and not synced between devices. Game saves are a separate system.
