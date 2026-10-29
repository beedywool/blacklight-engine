# Native parts

Some work needs Node.js or the operating system: a native database driver, the file system outside the data folder, an SDK that ships a `.node` addon. Game code cannot do it, since it runs in the Electron renderer, a WebView or a browser, where Node modules do not exist. A module puts that code in a **native part**: a file made with `defineNative` that runs in the Electron main process on desktop. The game reaches it with `platform.invoke(name, method, ...args)`, which crosses the IPC bridge; on mobile the same call goes to a Capacitor plugin with the same name and methods; on the web a fallback written in JavaScript can answer it.

```text
game (renderer)                         Electron main process
nativeModule<typeof notesNative>()  ──▶  defineNative({ name: 'notes', functions })
  notes.read('intro')                     checks the arguments, runs read(context, 'intro')
       ▲                                        │
       └──────────── structured clone ──────────┘
```

## Defining a native part

```ts
// modules/notes/native.ts — runs in the Electron main process
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { t } from '@blacklight/core/schema';
import { defineNative, fn } from '@blacklight/native';

const id = t.string({ pattern: /^[a-z0-9-]{1,40}$/ });

export const notesNative = defineNative({
  name: 'notes',
  functions: {
    read: fn([id], (context, note) =>
      readFile(join(context.dataDir, 'notes', `${note}.txt`), 'utf8').catch(() => ''),
    ),
    write: fn([id, t.string({ max: 10_000 })], async (context, note, text) => {
      await mkdir(join(context.dataDir, 'notes'), { recursive: true });
      await writeFile(join(context.dataDir, 'notes', `${note}.txt`), text);
    }),
  },
});
```

`fn(schemas, run)` declares one function: the schemas (the same `t` builders as module options, from the renderer-free entry `@blacklight/core/schema`) check each argument before `run` is called, and give `run` its parameter types. `run` receives a context first:

| Context field | Meaning                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `gameId`      | `id` from `game.config.ts`.                                                |
| `dataDir`     | The game's data folder (OS standard location, or the configured override). |
| `dev`         | `true` in development builds.                                              |

| `defineNative` option | Meaning                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `name`                | Name used with `platform.invoke`; lowercase letters, digits and dashes. |
| `functions`           | The functions the game may call, each made with `fn`.                   |
| `setup(context)`      | Runs once when the main process registers the module.                   |
| `dispose(context)`    | Runs when the app quits (close files and databases).                    |

## Calling it from the game

```ts
// modules/notes/notes.module.ts — runs in the game
import { defineModule, nativeModule } from '@blacklight/core';
import type { notesNative } from './native'; // type only: no Node code in the game bundle

export const notes = defineModule({
  name: 'notes',
  version: '1.0.0',
  platforms: ['desktop'],
  setup({ platform }) {
    return nativeModule<typeof notesNative>(platform, 'notes');
  },
});

// in a scene: typed from the definition
const text = await this.game.modules.notes?.read('intro'); // Promise<string>
```

`nativeModule<typeof definition>(platform, name)` returns an object whose methods call `platform.invoke(name, method, ...args)`; their parameter and return types come from the definition, read with `import type`, so the native file and its Node imports never reach the game bundle. The types follow the definition as you edit it; nothing else is generated.

## What crosses the bridge

- Only the functions listed in `functions`. Any other name (including `constructor`, `__proto__` or `toString`) is refused with the list of exposed functions.
- Arguments go through the structured clone algorithm (strings, numbers, booleans, `null`, arrays, plain objects, `Uint8Array`…), then through the schemas. A call with the wrong number of arguments or a wrong type is refused before `run`: `"notes.write" refused its arguments: `argument 2` must be a string of at most 10000 characters, got 3.`
- Return values must be structured-clone-able too; errors arrive in the game as an `Error` with the same message.
- The renderer never gets Node: there is no `nodeIntegration`, no `remote`, only this allowlisted `invoke` channel (see the desktop guide).

## Registration in the Electron main process

The desktop package (`@blacklight/native`) owns the main process. It registers each native part of the modules listed in `game.config.ts`, calls `setup` once, answers each `invoke(name, method, args)` from the renderer with `module.call(method, args, context)`, and calls `dispose` on quit. A module package declares its native entry as the `./native` export of its `package.json` (the official `sqlite` module: `@blacklight/module-sqlite/native`); a game-local module puts it in `modules/<name>/native.ts`.

## Mobile and web

On Android and iOS, `platform.invoke('notes', 'read', 'intro')` calls the Capacitor plugin registered as `notes` with the same method names (see the mobile guide for writing one). On the web, a module may answer the calls itself with `platform.registerFallback(name, implementation)` when the platform is the web platform; the official `sqlite` module does this with sql.js. Without a fallback, a call on the web rejects with `"notes.read" is not available on the web: it needs the desktop or mobile app.`; declare `platforms` so the module is skipped where it cannot work.

## Limits

- A native part runs with the full rights of the app: it is code you ship, not a sandbox. Validate paths (no `..`), sizes and values in the schemas, as the example does.
- Every call is asynchronous and crosses a process boundary; batch work into one call instead of calling in a tight loop.
- Native addons must be built for Electron's Node ABI; the desktop build rebuilds them. Addons that ship Node-API prebuilds (better-sqlite3) need no rebuild.
- The mobile counterpart is a separate Capacitor plugin written in Swift and Kotlin; `defineNative` code does not run on phones.
