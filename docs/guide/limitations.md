# Accepted limitations

These are known, deliberate and will still be true after 1.0. Each subsystem's page repeats the ones that concern it.

## Shaders cannot read the UI

Menus are HTML (Vue components) drawn over the canvas, and a WebGL shader cannot read HTML pixels. Effects that must distort the UI (glitch, halftone, transition distortion) run on an effects layer above or below it, or the component is rendered inside the canvas with `<PixiRender>`, which costs more.

## Floating point differs between browsers

Chrome, Electron and Android run V8; iOS and Safari run JavaScriptCore. `Math.sin` and friends can return different last digits, which is enough to desynchronize an online game with rollback. Online simulation code must use the engine's deterministic math and seeded random numbers; a lint rule refuses `Math.random`, `Math.sin`, `Date.now` and similar in simulation files. See [Determinism](./networking-determinism).

## The Steam overlay may not show in Electron

Steam draws its overlay by hooking the graphics API, which Electron's renderer does not always allow. The engine applies the known workarounds; when they fail the overlay is missing. Achievements, Steam Cloud and rich presence work either way.

## Controller motion sensors are not read

The desktop apps read gamepads through SDL in the main process, and the SDL binding the engine uses (@kmamal/sdl 0.11) does not expose SDL's controller sensors, so `gamepad(game, i).hasGyro` is `false` and no gyroscope or accelerometer data reaches the game. Browsers and the mobile WebViews have no standard API for them either. Rumble, trigger rumble and the light bar work. See [Desktop](./desktop).

## No Steam leaderboards

steamworks.js 0.4.0, the Steamworks binding of the desktop apps, does not expose leaderboards. On the Steam backend of the achievements module, scores and `leaderboard()` fail with a message that says so; a game that needs scores on Steam uses the `server` backend and the [reference server](./server). Steam achievements, Cloud and rich presence work.

## Client-side protection deters, it does not guarantee

Encrypted saves, obfuscation, bytecode and blocked developer tools stop casual cheating (console, save editors, memory scanners). A determined attacker with a debugger on their own machine can still win. Anything that must be fair between players is checked by a server.

## Bytecode follows the Electron version

Release builds compile the Electron main process to V8 bytecode, which is tied to the exact V8 in Electron: every Electron upgrade rebuilds it. The game code in the page is obfuscated instead (loading bytecode there would need Node in the sandboxed renderer). Stack traces from release builds need the private source maps kept with each release.

## Physical devices need a person

Real gamepads (rumble, gyro, LEDs), real phones, the Steam client and store signing with real certificates cannot run in CI. They are covered by emulators, mocks and dry runs, and by the manual checklist (`MANUAL_TESTS.md` in the repository) run before each release.
