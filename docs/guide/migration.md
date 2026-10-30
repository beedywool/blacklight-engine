# Coming from another engine

This page maps the ideas of three kinds of tools onto Blacklight Engine: event-sheet engines in the style of Clickteam Fusion, plain PixiJS, and scene-based frameworks such as Phaser. It is a translation of concepts, not a conversion tool: no project format is imported, and the engine does not copy another engine's API.

## From event-sheet engines (Fusion-style)

Event-sheet engines describe logic as conditions and actions attached to frames and objects. Blacklight Engine keeps the structure (frames become scenes, active objects become classes, movements become behaviors) and replaces the sheet with TypeScript: each event line becomes an `if` in an `update()` method, run at the same fixed rate.

| Event-sheet idea                                | Blacklight Engine                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Application                                     | The game: `game.config.ts` and the `game` object.                                                                    |
| Frame                                           | A [scene](./scenes): `scenes/<name>/<name>.scene.ts`, a class with `create()` and `update()`.                        |
| "Start of frame" condition                      | `create()` of the scene.                                                                                             |
| "Always" condition, event loop                  | `update()`, called 60 times per second whatever the display rate.                                                    |
| Active object                                   | A class extending [`Sprite`](./objects) in `objects/<name>/`, spawned with `this.spawn(Hero, { x, y })`.             |
| Object placed in the frame editor               | `spawn` in `create()`, or a JSON layout from the VS Code [scene editor](./vscode) loaded with `scene.load(layout)`.  |
| Alterable values A, B, C…                       | Named, typed class fields: `hp = 100`, `coins = 0`.                                                                  |
| Alterable strings, flags                        | Fields of any type: `name = 'Ann'`, `hasKey = false`.                                                                |
| Global values                                   | Fields of a module you import, or `game.save.data` when they must be saved.                                          |
| Movement (8 directions, platform, ball, path…)  | A [behavior](./behaviors): `static behaviors = [behaviors.platformer()]`. Nineteen ship with the engine.             |
| Animation sequences, numbered directions        | Named animations in an [`.anim.json`](./sprites-and-animations); facing names (`walk-left`) with mirroring fallback. |
| "Collision between" condition                   | `onCollide(other)` on the object, filtered with `other.is(Enemy)`.                                                   |
| Qualifiers, families                            | Base classes (`class Enemy extends Sprite`) and tags (`static tags = ['enemy']`), tested with `is()`.                |
| "Every 2 seconds" condition                     | `this.after(ms, fn)` and `this.every(ms, fn)`, on game time: they pause with the game.                               |
| "Pick one of" / spread value                    | `this.random.int(a, b)`: a seeded generator, reproducible from a seed.                                               |
| Sub-application                                 | `scene.hostScene(name, rect)`: a scene drawn inside another one, with its own viewport.                              |
| Counters, strings, HUD objects                  | Vue screens in the [UI layer](./ui) (`Counter`, `Gauge`), or `Text` objects in the `hud` layer.                      |
| Storyboard controls (next frame, jump to frame) | `this.goto('battle', params, { transition: 'iris' })`.                                                               |
| INI / array objects for saving                  | `game.save` with typed `SaveData`, slots and encryption ([Saves](./saves)).                                          |
| Extensions                                      | [Modules](./modules) and any browser npm package, imported like in a web app.                                        |

What changes in practice:

- **Order is explicit.** An event sheet runs top to bottom every frame; here each object runs its own behaviors, then its `update()`, in spawn order, after the scene's `update()`. Logic that must see every object at once (scoring, waves) belongs in the scene.
- **Values have names and types.** The compiler catches a misspelled field or an animation name that does not exist, where a sheet would silently read 0.
- **No directions as numbers.** A facing is `'left'`, `'upright'`; angles are degrees or radians with the `angle` and `rotation` properties.
- **Files instead of a project blob.** Each scene, object and screen is a file you can diff, review and merge.

## From PixiJS

Blacklight Engine draws with PixiJS v8 and exposes it: a `GameObject` is a Pixi `Container`, `Graphics.draw` is a Pixi `Graphics`, `Sprite.view` a Pixi `Sprite`, and Pixi filters, blend modes and masks work on every object. What the engine adds is the game structure around the renderer.

| In plain PixiJS                                      | In Blacklight Engine                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `new Application()`, `app.init()`, append the canvas | Done by the CLI's entry; you write `game.config.ts`.                                             |
| `app.ticker.add(dt => …)` with a variable delta      | `update()` at a fixed 60 Hz, rendering interpolated between steps.                               |
| `Assets.load()` before use                           | `static assets` and the scene's `assets/` folder, loaded before `create()`, one chunk per scene. |
| Resizing the canvas by hand                          | A virtual resolution with `extend` or `letterbox`, device pixel ratio and safe areas handled.    |
| `container.addChild(sprite)`                         | `this.spawn(Class, props)`; children with `spawn(Class, { parent })`.                            |
| Hand-written hit tests and input listeners           | Hitboxes, collision layers, `onCollide`, raycasts, and an action map for every input device.     |
| DOM overlays positioned by hand                      | A Vue UI layer scaled with the game, with focus navigation for gamepads.                         |

You can keep Pixi code: create Pixi objects inside a `GameObject` (`this.addChild(new PixiSprite(texture))`) or draw into `Graphics.draw`. Scenes, cameras and snapshots handle only engine objects, so state that must be saved or rolled back belongs in object fields, not in raw Pixi objects.

## From Phaser and similar frameworks

Phaser-style frameworks share the scene idea. The differences are in how objects and logic are organized.

| Phaser concept                        | Blacklight Engine                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Scene `preload` / `create` / `update` | `static assets` (declared, loaded for you), `create(params)`, `update()` at a fixed step.                                      |
| `this.scene.start('Level', data)`     | `this.goto('level', data, { transition })`; scenes found by folder name and lazy-loaded.                                       |
| Game objects created with factories   | Your own classes extending `Sprite`, `Graphics`, `Text`…, spawned by class or by name.                                         |
| Arcade physics bodies                 | Core collisions and movement behaviors; rigid bodies with the optional [`@blacklight/physics`](./collisions#physics) (Rapier). |
| `this.anims.create({ key, frames })`  | An `.anim.json` file next to the object, with a JSON Schema for completion.                                                    |
| Keyboard keys and `cursors`           | Named actions (`left`, `jump`) bound to keys, buttons and touch, rebindable by players.                                        |
| Tweens and timelines                  | `this.tween()` on game time, and `useTimeline` (Motion) for UI.                                                                |
| DOM elements or bitmap text for menus | Vue screens with a screen stack, focus, widgets and transitions.                                                               |
| Plugins                               | [Modules](./modules) with typed config, a native part on desktop and mobile, and a registry.                                   |

Two habits to change: put per-object logic in the object's class rather than in the scene's `update()`, and reach for a ready-made behavior before writing movement code.

## Limits

- No importer exists for Fusion, Phaser or other project files; projects are rewritten, scene by scene.
- There is no visual event editor and none is planned: logic is TypeScript only.
- Pixi objects added by hand are invisible to snapshots, rollback and the debug overlay's object list.
