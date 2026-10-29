# Hot reload

`blacklight dev` reloads what you save without restarting the game: the player stays where it was, the score keeps its value, the open menu stays open. What happens depends on the file.

| File                                                                     | On save                                                                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `scenes/<name>/<name>.scene.ts`                                          | The running scene is rebuilt from the new class and gets its state back (below). Other scenes use the new class at their next `goto`. |
| `objects/<name>/<name>.object.ts` (and scene-local ones)                 | Every live instance runs the new methods and keeps its state; new instances use the new class.                                        |
| `.vue` screens and components                                            | Vue hot reload (`@vitejs/plugin-vue`): the component is replaced in place, its open screens stay open.                                |
| `.css` imported by screens                                               | Replaced in place.                                                                                                                    |
| `game.config.ts`, `.anim.json`, `.aseprite.json`, added or removed files | Full page reload: the engine reads them at start.                                                                                     |
| Other modules (helpers, `modules/`)                                      | Hot reload goes up to the scene or object modules that import them; when nothing above handles it, the page reloads.                  |

## Scenes

When the module of the running scene changes, the engine:

1. creates the new scene class and runs its `create()` with the parameters the scene was started with (`goto('battle', { enemy })`);
2. restores the old scene's [snapshot](./snapshots) into it: objects (created, destroyed, moved, their data fields and behaviors), cameras, the random generator and the step count;
3. copies the scene's own fields (`score`, `this.player`); references to objects point to the restored objects;
4. stops the old scene and shows the new one.

Objects the old scene had destroyed stay destroyed and objects it spawned are re-created, so a level edited mid-play continues as it was. Code added to `create()` that registers listeners, timers or tweens runs again; spawns added to `create()` appear only when the scene restarts (`blacklight.goto(blacklight.scene.name)` in the console), because the snapshot decides which objects exist.

When the new `create()` throws, the running scene keeps going with the new methods (as for objects) and the error is printed in the console. Fix it and save again.

Overlays (`game.overlay`) and hosted scenes of the changed class get the new methods without being rebuilt.

## Objects

When an object module changes, the engine copies the new methods, getters and static properties onto the class the game already uses, and adds fields that the new class declares and live objects lack (with their initial value). Objects keep their position, velocity, animation and data. Because the class itself is kept, `instanceof`, subclasses and imports of the class in other modules all see the new code.

Static properties read only when an object is created (`static behaviors`, `static hitbox`, `static collision`, `static tags`) apply to objects spawned after the change.

## Writing code that reloads well

- Keep game state in fields of scenes and objects, not in module-level variables: module variables restart with the module.
- Put one-time setup in `create()` and per-step logic in `update()`; `update()` changes apply on the next step.
- A scene class must stay the default export of its file, named after its folder. Otherwise the page reloads.

## How it works

The CLI's Vite plugin appends a few lines to every scene and object module in dev: the module accepts its own updates (`import.meta.hot.accept`) and hands the new class to the game, which `installHotReload` from `@blacklight/core/debug` connected when the dev entry started. Release builds contain neither.

## Limits

- Timers and tweens of the old scene are not carried over: the new `create()` starts its own. Timers of reloaded objects keep running with the old callback until they fire.
- Module-level state (a `let` outside the class) is reset by the reload.
- A class that extends another object class reloads when its own file changes; when only the parent object's file changes, objects of the subclass get the parent's new methods but their own module is not re-run.
- Renaming a field loses its value (it is a new field). Renaming a scene or object folder reloads the page.
- `game.config.ts`, `.anim.json` and Aseprite files reload the page.
