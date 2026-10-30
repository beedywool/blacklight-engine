# Shooting

A bullet is an ordinary object with two ready-made behaviors: [bullet](../behaviors/bullet) moves it in a straight line along its angle, [destroyOutsideLayout](../behaviors/destroy-outside-layout) removes it once it leaves the scene, so a long fight does not accumulate thousands of objects. The shooter spawns bullets at its own position and angle, with a cooldown counted in fixed steps.

<LiveExample src="recipes/shooting" hint="Click the preview. Left and right turn, hold Space to fire." />

Points worth copying:

- **Fire rate in steps.** `update()` runs 60 times per second on every machine, so a counter decremented once per step is an exact fire rate (`cooldown = 8` is 7.5 shots per second), independent of the display's refresh rate.
- **Collision layers.** The bullet sits on layer `bullet` and only reports collisions with `crate` (`mask`), so bullets ignore each other and the shooter. The crate reacts in its own `onCollide`.
- **Spawn ahead of the barrel.** `move()` after `spawn` pushes the bullet to the muzzle; `move` stops at solids, so a bullet fired against a wall does not start inside it.
- **Angle before behaviors.** Spawn properties are set before behaviors attach, so `bullet` reads the `angle` given to `spawn`. Pass `angle` in the behavior options instead for a fixed direction.

For many identical bullets drawn from one texture, a `Sprite` with `static texture` is cheaper than a `Graphics` per bullet. For hit-scan weapons (lasers), `scene.raycast(from, to, filter)` returns the first object on a line without spawning anything ([Collisions](../guide/collisions)).
