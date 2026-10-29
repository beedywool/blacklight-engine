# Accepted limitations

These are known, deliberate and will still be true after 1.0. Each subsystem's page repeats the ones that concern it.

## Shaders cannot read the UI

Menus are HTML (Vue components) drawn over the canvas, and a WebGL shader cannot read HTML pixels. Effects that must distort the UI (glitch, halftone, transition distortion) run on an effects layer above or below it, or the component is rendered inside the canvas with `<PixiRender>`, which costs more.

## Floating point differs between browsers

Chrome, Electron and Android run V8; iOS and Safari run JavaScriptCore. `Math.sin` and friends can return different last digits, which is enough to desynchronize an online game with rollback. Online simulation code must use the engine's deterministic math and seeded random numbers; a lint rule refuses `Math.random`, `Math.sin`, `Date.now` and similar in simulation files. See [Determinism](./networking-determinism).

## The Steam overlay may not show in Electron

Steam draws its overlay by hooking the graphics API, which Electron's renderer does not always allow. The engine applies the known workarounds; when they fail the overlay is missing. Achievements, Steam Cloud and rich presence work either way.

## Client-side protection deters, it does not guarantee

Encrypted saves, obfuscation, bytecode and blocked developer tools stop casual cheating (console, save editors, memory scanners). A determined attacker with a debugger on their own machine can still win. Anything that must be fair between players is checked by a server.

## Bytecode follows the Electron version

Release builds compile JavaScript to V8 bytecode, which is tied to the exact V8 in Electron: every Electron upgrade rebuilds it. Stack traces from release builds need the private source maps kept with each release.

## Physical devices need a person

Real gamepads (rumble, gyro, LEDs), real phones, the Steam client and store signing with real certificates cannot run in CI. They are covered by emulators, mocks and dry runs, and by the manual checklist (`MANUAL_TESTS.md` in the repository) run before each release.
