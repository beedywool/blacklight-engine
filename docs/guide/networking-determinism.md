# Determinism

Rollback and lockstep send inputs, not positions. Every machine runs the simulation on its own and must get the same result to the last bit; one different digit grows until the players see different games. The engine gives you what is needed (a fixed step, seeded random numbers, deterministic math, exact snapshots); simulation code has to use it.

## Simulation code

Simulation code is everything that changes game state during a step of an online scene: the scene's `update()`, its objects' `update()`, behaviors, collision callbacks. Display code (`render()`, UI screens, particles, sounds, camera shake) may do as it likes.

| Do not use in simulation code                                            | Use instead                                                     | Why                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `Math.random()`, `crypto.getRandomValues`                                | `this.scene.random` (`next`, `int`, `float`, `pick`, `shuffle`) | Unseeded: every machine draws other numbers.               |
| `Math.sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `pow`, `hypot`, `cbrt`… | `DMath.sin` … from `@blacklight/core`                           | Engines may round the last bit differently (see below).    |
| `x ** y`                                                                 | `x * x`, `DMath.pow(x, y)`                                      | `**` is `Math.pow`.                                        |
| `Date.now()`, `new Date()`, `performance.now()`                          | `this.scene.steps`, `after` / `every` timers, `game.time.dt`    | The clock differs between machines and between replays.    |
| State kept in the `Scene` subclass                                       | A field on an object (a `Referee`, a `Match`)                   | Scene fields are not in snapshots, so rollback skips them. |
| Tweens that move gameplay objects                                        | Velocities, fields updated in `update()`                        | Tweens are not in snapshots.                               |

`Math.sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`, `min`, `max`, `fround`, `imul` and the `Math` constants are exact by specification and allowed. So are `+ − × ÷` on numbers: JavaScript computes them in IEEE 754 double precision everywhere, without the extended precision or fused operations that make native code differ.

Iteration order of objects, arrays, `Map` and `Set` is fixed in JavaScript; `Array.prototype.sort` is stable on every current engine, so a sort with a consistent comparator gives the same order everywhere.

## Why `Math.sin` is not enough

The ECMAScript specification lets each engine approximate `Math.sin`, `Math.exp`, `Math.pow` and the other transcendental functions. V8 (Chrome, Electron, Android WebView, Node) and JavaScriptCore (Safari, every iOS browser, iOS WebView) use different implementations, and for some arguments their results differ in the last bit. An iPhone and a PC in the same match are enough to desynchronize it (limitation L2).

`DMath` re-implements these functions with only `+ − × ÷` and `Math.sqrt` (the algorithms of fdlibm, the library V8 started from), so the same input gives the same bits on every engine:

```ts
import { DMath } from '@blacklight/core';

const angle = DMath.atan2(target.y - this.y, target.x - this.x);
this.velocity.set(DMath.cos(angle) * 300, DMath.sin(angle) * 300);
```

| `DMath` member                                                                           | Notes                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sin`, `cos`, `tan`                                                                      | Within 1–2 units in the last place (ulp) of `Math`; precision drops for \|x\| above about 10⁶.         |
| `asin`, `acos`, `atan`, `atan2`                                                          | Within 2 ulp; same special cases as `Math` (signed zeros, infinities).                                 |
| `exp`, `log`, `log2`, `log10`                                                            | Within 2 ulp; `log2` of a power of two is exact.                                                       |
| `pow`                                                                                    | Within a few ulp (64 for huge results such as 10³⁰⁸); integer exponents up to 64 by repeated products. |
| `cbrt`, `hypot`                                                                          | Within 2 ulp; `hypot` takes any number of arguments.                                                   |
| `sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`, `min`, `max`, `fround`, `imul` | `Math`'s own functions, exact by specification.                                                        |
| `PI`, `E`, `LN2`, `LN10`, `LOG2E`, `LOG10E`, `SQRT2`, `SQRT1_2`                          | Same values as `Math`.                                                                                 |

The engine's own simulation code uses `DMath`: `Vector2.length`, `normalize`, `angle`, `distance`, collision shapes and raycasts, the movement, grid and pointer behaviors, and child object transforms. Cameras, particles and audio keep `Math`, since they only change what is displayed.

## The lint rule

`eslint-plugin-blacklight` refuses these calls in simulation code:

```sh
pnpm add -D eslint-plugin-blacklight
```

```js
// eslint.config.js
import { blacklight } from 'eslint-plugin-blacklight';

export default [
  ...blacklight.configs.recommended,
  // more folders that hold simulation code:
  { files: ['src/match/**'], rules: { 'blacklight/deterministic': 'error' } },
];
```

```
scenes/push-push-online/objects/wrestler/wrestler.object.ts
  41:22  error  `Math.atan2` can return different last digits on V8 and JavaScriptCore,
                which desynchronizes online players. Use `DMath.atan2` from @blacklight/core
```

`configs.recommended` recognizes simulation code three ways:

| How                 | Example                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Folder or file name | Anything under a `*-online/` folder (`scenes/push-push-online/`, `objects/puck-online/`), a `sim/` folder, or a `*.sim.ts` file. |
| A marked class      | `static deterministic = true` in the class body: only that class is checked (objects shared by offline and online scenes).       |
| A marked file       | A comment containing `@blacklight-deterministic` anywhere in the file.                                                           |

The rule `blacklight/deterministic` takes one option, `scope`: `'file'` (default when you configure it yourself: the whole file is checked) or `'marked'` (only marked classes and files). It reports `Math.random`, the `Math` functions listed above (also through `Math['sin']` and `const { sin } = Math`), `**` and `**=`, `Date.now()`, `new Date()`, `Date()`, `performance.now()`, and `crypto.getRandomValues` / `randomUUID` (also through `globalThis`, `window`, `self`). A local variable or import named `Math` or `Date` is left alone.

## Checking it

- The session compares checksums of the confirmed state every 30 steps and reports what differs ([Networking](./networking#desync-detection)).
- [Testing](./networking-testing) runs several instances of your scene against a simulated network in Vitest; run it in Node (V8) and in WebKit (JavaScriptCore) and compare the checksums, as the engine's own gate does (`e2e/net.spec.ts`).

## Limits

- `DMath` results are deterministic, not correctly rounded: they can differ from `Math` in the last digits. Do not mix `Math.sin` and `DMath.sin` on the same value and expect equality.
- `sin`, `cos` and `tan` reduce the argument with a three-part π/2: beyond about 10⁶ radians precision falls (still deterministic). Keep angles small with `angleDelta` or modulo 2π.
- The lint rule sees direct uses only. A helper in another file that calls `Math.sin` passes unless that file is simulation code too; put shared math in a `sim/` folder or mark it.
- Motion's easing functions behind `tween` use `Math`: tweens are display-only in online scenes anyway.
- Rapier (`@blacklight/physics`) is not part of snapshots, so physics bodies cannot be used in rollback scenes.
