# Production hardening

Release builds (`blacklight build`) turn on every protection below; dev builds (`blacklight dev`) turn them all off, so the console, hot reload and source maps work while you develop. Each measure has a switch in `security` in `game.config.ts`; `security: false` turns them all off.

```ts
export default defineConfig({
  // ...
  security: {
    obfuscate: 'low',
    protect: ['Player.hp', 'save.gold'],
    csp: { connect: ['https://api.example.com', 'wss://relay.example.com'] },
    onTamper: 'restore',
  },
});
```

| Switch      | Default (release) | Measure                                                                                                                                                                                                                   |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devtools`  | `true`            | SEC-01. No developer tools: F12, Ctrl/Cmd+Shift+I/J/C, Cmd+Alt+I and Ctrl+U do nothing, no context menu, no View menu; the desktop app refuses `--remote-debugging-port`, `--inspect`, `--devtools` and similar switches. |
| `fuses`     | `true`            | SEC-02 (desktop). Electron fuses: no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`, no `--inspect`, encrypted cookies, the app loaded only from its ASAR with integrity validation, no extra `file://` privileges.            |
| `obfuscate` | `'low'`           | SEC-03. javascript-obfuscator on the game's own chunks: `'low'`, `'medium'`, `'high'` or `false`.                                                                                                                         |
| `bytecode`  | `true`            | SEC-04 (desktop). The main process (engine and native parts of modules) ships as V8 bytecode.                                                                                                                             |
| `protect`   | `[]`              | SEC-05. Values watched for memory edits (below).                                                                                                                                                                          |
| `debugger`  | `true`            | SEC-06. A debugger pausing the game is detected.                                                                                                                                                                          |
| `webview`   | `true`            | SEC-07 (mobile). The WebView cannot be inspected from a computer (Android `WebContentsDebuggingEnabled`, iOS `isInspectable` off).                                                                                        |
| `csp`       | `true`            | SEC-08. Strict Content Security Policy, no `eval`. An object adds allowed sources.                                                                                                                                        |
| `onTamper`  | `'restore'`       | SEC-09. What happens when nothing listens to `game.on('tamper')`: `'restore'` (put the value back and log) or `'quit'` (also close the game).                                                                             |

Other packages read the same resolved switches with `resolveSecurity(config.security, release)` from `@blacklight/core/config`.

## Content Security Policy

Release pages carry this policy (a `<meta>` tag in `index.html`; the desktop app also sends it as a header):

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:;
connect-src 'self' data: blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none';
form-action 'none'
```

Scripts come only from the game's own files: no inline script, no `eval`, no `new Function`. `'wasm-unsafe-eval'` allows compiling WebAssembly (Rapier physics, the Draco and KTX2 decoders of 3D models) and nothing else; `worker-src 'self' blob:` lets Pixi and the 3D decoders run their workers, which start from blob URLs. `style-src 'unsafe-inline'` stays because Vue and the engine set element styles at run time, which runs no script. Release builds also load Pixi's eval-free shader code paths (`pixi.js/unsafe-eval`), since Pixi otherwise compiles them with `new Function`.

WebAssembly libraries built with Emscripten's embind and dynamic execution compile small invoker functions with `new Function`; three's Basis transcoder (KTX2 textures) is one. Release builds replace those invokers with the equivalent closures Emscripten itself generates with `DYNAMIC_EXECUTION=0`, so KTX2 textures load under the policy without `'unsafe-eval'`.

A game that talks to its own servers lists them: `csp: { connect: ['https://api.example.com'] }`. `img`, `media` and `font` add sources the same way. A source with spaces, semicolons or `'unsafe-…'` is refused at startup.

## Obfuscation

Only chunks made mostly of your code are obfuscated (scenes, objects, modules of the game); the engine and libraries are open source, and obfuscating them would only slow them down. The levels:

| Level    | What it does                                                                                                     | Cost on the benchmark |
| -------- | ---------------------------------------------------------------------------------------------------------------- | --------------------- |
| `low`    | Renames locals to hexadecimal names, moves strings to a rotated array, simplifies.                               | about 4 %             |
| `medium` | Adds base64-encoded strings, split strings, control-flow flattening (30 %), object keys, numbers as expressions. | about 30 %            |
| `high`   | RC4-encoded strings, 75 % control-flow flattening, dead code, self-defending code.                               | higher                |

SEC-10 caps the cost of obfuscation and bytecode at 10 %, so the default is `low`; `packages/cli/test/desktop.spec.ts` measures it on every CI run (300 objects moving, colliding and scoring, plain and obfuscated, median of 9 runs). None of the levels uses `debugProtection`, which needs `new Function` and would break the CSP.

## V8 bytecode

The desktop app's main process (the engine's Electron code and the native parts of modules) is compiled to V8 bytecode with bytenode inside a real Electron main process of the version that ships, and the JavaScript source is removed from the package. Bytecode is tied to the exact Electron/V8 build and CPU architecture: it is compiled on the machine that builds the package, so build each OS (and, on macOS, each architecture) on a runner of that kind; a cross build leaves bytecode out with a warning.

The game's own code runs in the sandboxed page, where loading bytecode would need Node; it is obfuscated instead.

## Protected values

```ts
security: {
  protect: ['Player.hp', 'battle.score', 'save.gold'];
}
```

A path starts with an object name (every live instance of that class), a scene name, or `save` (`game.save.data`), followed by the field. On the first step a protected field exists, it becomes an accessor that keeps the value, a masked copy (XOR with random bits) and a checksum of the masked copy. Reading the field checks both copies, and every protected value is checked every 15 steps. A memory editor that changes the visible value no longer matches the masked copy; one that finds and changes the masked copy breaks its checksum; either way the game reports tampering and knows which copy is right.

Writes through the field (`this.hp -= 10`) update both copies, so game code does not change. Protect numbers, strings, booleans and small values replaced as a whole: mutating inside a protected object (`stats.hp++` on a protected `stats`) is not seen.

## Debugger detection

Every second the game runs a `debugger` statement and times it. Without developer tools it costs nothing; with a debugger attached it pauses, and a pause longer than 100 ms is reported as `tamper` with `kind: 'debugger'` (once per pause). Release builds keep the statement through minification for this. In the desktop app, developer tools cannot open at all (`devTools: false`); if they ever do, they are closed and reported with `kind: 'devtools'`.

## Tamper reaction

```ts
game.on('tamper', (event) => {
  telemetry.report('tamper', { kind: event.kind, path: event.path });
  event.restore(); // put the expected value back
});
```

| Field       | Meaning                                               |
| ----------- | ----------------------------------------------------- |
| `kind`      | `'value'`, `'debugger'` or `'devtools'`.              |
| `path`      | Protected path, for `value`.                          |
| `expected`  | Value the game wrote last.                            |
| `found`     | Value found in memory.                                |
| `restore()` | Puts `expected` back (no effect for the other kinds). |

A listener replaces the default reaction. Without one, the value is restored and a warning logged, and with `onTamper: 'quit'` the game also closes.

## Limits

- Client-side protection deters, it does not guarantee (accepted limitation L4). A determined player with a debugger on their own machine wins; anything that must be fair between players is checked by a server.
- Browsers keep F12 and their menus for themselves in some versions: on the web, blocking developer tools only stops the page from reacting to the shortcuts and the context menu. The desktop and mobile apps block them for real.
- ASAR integrity validation is enforced by Electron on Windows and macOS only; on Linux the fuse is set but Electron does not check the archive.
- V8 bytecode covers the main process, not the page (see above), and must be rebuilt with every Electron upgrade (L5). Release stack traces of the main process need the source maps you keep with each release.
- Protected values cover fields replaced as a whole, not mutations inside objects or arrays.
