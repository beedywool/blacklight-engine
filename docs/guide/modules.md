# Modules

A module adds a service to a game: a database, HTTP requests, player accounts, achievements, telemetry. It is a plain object made by `defineModule`, listed in `game.config.ts`, set up once before the first scene, and reached from anywhere as `game.modules.<name>` with full types. Modules come from three places: the official `@blacklight/module-*` packages, packages from the [module registry](./modules-registry) (`blacklight-module-*`), and the game's own `modules/` folder.

```sh
blacklight add sqlite
```

`blacklight add` installs the package, adds it to `modules` in `game.config.ts` and regenerates the types. Then:

```ts
// game.config.ts
export default defineConfig({
  // ...
  modules: {
    sqlite: { migrations: ['CREATE TABLE scores (name TEXT, points INTEGER)'] },
  },
});
```

```ts
// scenes/results/results.scene.ts
const { sqlite } = this.game.modules;
await sqlite.execute('INSERT INTO scores VALUES (?, ?)', [this.player.name, this.points]);
const best = await sqlite.query<{ name: string; points: number }>(
  'SELECT * FROM scores ORDER BY points DESC LIMIT 10',
);
```

## Official modules

| Module          | Package                            | What it does                                                                                             | Guide                          |
| --------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `http`          | `@blacklight/module-http`          | JSON requests, timeouts, authorization per server, offline queue that replays requests                   | [below](#http)                 |
| `sqlite`        | `@blacklight/module-sqlite`        | Local SQLite on every platform: better-sqlite3 (desktop), Capacitor SQLite (mobile), sql.js + OPFS (web) | [below](#sqlite)               |
| `cloud-save`    | `@blacklight/module-cloud-save`    | Uploads save slots to the reference server or Steam Cloud, syncs them at startup, resolves conflicts     | [below](#cloud-save)           |
| `accounts-oidc` | `@blacklight/module-accounts-oidc` | Player sign-in over OpenID Connect (PKCE) with a BlackLight SSO preset                                   | [Accounts](./accounts)         |
| `achievements`  | `@blacklight/module-achievements`  | Achievements and leaderboards on Steam, Game Center, Google Play Games or the reference server           | [Achievements](./achievements) |
| `telemetry`     | `@blacklight/module-telemetry`     | Opt-in crash reports and usage events over the Sentry protocol                                           | [Telemetry](./telemetry)       |
| `discord`       | `@blacklight/module-discord`       | Discord Rich Presence on desktop                                                                         | desktop guide                  |
| physics         | `@blacklight/physics`              | Rapier rigid bodies; imported directly, not listed under `modules`                                       | [Collisions](./collisions)     |

`cloud-save`, `accounts-oidc` and `achievements` depend on `http`; `blacklight add` installs it with them.

## Writing a module

A game-local module lives in `modules/<name>/<name>.module.ts` and exports the result of `defineModule`. The name must match the folder and the key in `game.config.ts`.

```ts
// modules/score/score.module.ts
import { defineModule, t } from '@blacklight/core';

export const score = defineModule({
  name: 'score',
  version: '1.0.0',
  config: t.object({
    target: t.number({ integer: true, min: 1 }).default(1000),
  }),
  async setup({ config, storage, events }) {
    let best = (await storage.get<number>('best')) ?? 0;
    return {
      get best() {
        return best;
      },
      async submit(points: number) {
        if (points <= best) return false;
        best = points;
        await storage.set('best', best);
        return points >= config.target;
      },
    };
  },
});
```

```ts
// game.config.ts
modules: { score: { target: 5000 } },

// anywhere
const reached = await this.game.modules.score.submit(6200); // boolean
```

| Field          | Default  | Meaning                                                                                                                               |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | required | Lowercase letters, digits and dashes. The key under `modules` in `game.config.ts` and in `game.modules`.                              |
| `version`      | required | Semver version of the module.                                                                                                         |
| `config`       | none     | Schema of the options (`t.object({...})`). Options are checked at startup and defaults filled in; without a schema the entry is `{}`. |
| `platforms`    | all      | `['web', 'desktop', 'android', 'ios']` subset. Elsewhere `setup` does not run, `game.modules.<name>` is `undefined` and typed so.     |
| `dependencies` | `[]`     | Modules set up before this one. A missing one stops the game with the `blacklight add` command to run.                                |
| `setup`        | required | Receives the [context](#context); its return value (or the value its promise resolves to) becomes `game.modules.<name>`.              |
| `dispose`      | none     | Called with the API on shutdown, after the `onDispose` callbacks.                                                                     |

Modules are set up after the game plugins (so `context.platform` is the desktop or mobile platform when one is installed) and before the first scene, in dependency order. Every option of every module is checked first and all problems are reported together; a module that throws in `setup` stops the game with its name in the message. On shutdown (`game.destroy()`, or the tab or window closing) modules are disposed in reverse order.

### Option schemas

`t` builds runtime schemas that also give TypeScript the types of the options. The same schemas check the arguments of [native functions](./modules-native).

| Builder                                | Accepts                                                               |
| -------------------------------------- | --------------------------------------------------------------------- |
| `t.string({ min, max, pattern, url })` | a string; `url: true` asks for an absolute `http(s)` URL              |
| `t.number({ min, max, integer })`      | a finite number                                                       |
| `t.boolean()`                          | `true` or `false`                                                     |
| `t.enum(['a', 'b'])`                   | one of the listed values                                              |
| `t.array(item, { max })`               | a list of `item`                                                      |
| `t.object({ ... })`                    | an object with these keys; unknown keys are refused with a suggestion |
| `t.record(value)`                      | an object used as a map                                               |
| `t.bytes()`, `t.unknown()`             | a `Uint8Array`; anything                                              |
| `.optional()`, `.default(value)`       | accepts `undefined`; uses `value` when the option is missing          |

An invalid option stops the game with every problem listed, for example `` `modules.score.target` must be an integer >= 1, got 0 `` or `` `modules.score` has an unknown option `targt`. Did you mean "target"? ``.

### Types

`blacklight dev`, `build` and `types` write `.blacklight/types.d.ts`, which types `game.modules` from the modules listed in `game.config.ts`, and types each entry of `modules` from the module's schema, so a misspelt option is an editor error before it is a startup error. A module that is not listed does not exist on `game.modules`.

## Context

`setup(context)` receives:

| Property        | Type                     | Meaning                                                                                                                  |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `name`          | `string`                 | The module name.                                                                                                         |
| `config`        | from the schema          | Options from `game.config.ts`, checked, with defaults.                                                                   |
| `game`          | `Game`                   | The running game (`game.events`, `game.config`, `game.settings`…).                                                       |
| `platform`      | `Platform`               | Files in the data folder, `invoke` for native calls, platform events (`resume`, `deeplink`), `openUrl`, `name`, `steam`. |
| `events`        | `EventBus<ModuleEvents>` | A bus shared by every module; extend `ModuleEvents` by declaration merging, prefix events with the module name.          |
| `modules`       | `GameModules`            | APIs of the modules set up before this one (its dependencies).                                                           |
| `saves`         | `ModuleSaves`            | The save system as modules see it (`slots`, `exportSlot`, `importSlot`, `onSaved`); `undefined` when the game has none.  |
| `network`       | `ModuleNetwork`          | `online`, `on('online' \| 'offline')`, and `queue()` for work that must reach a server.                                  |
| `log`           | `ModuleLogger`           | `debug` (dev builds only), `info`, `warn`, `error`, prefixed with `[name]`.                                              |
| `storage`       | `ModuleStorage`          | JSON values of this module on the device (`modules/<name>/` in the data folder).                                         |
| `dev`           | `boolean`                | `true` under `blacklight dev`.                                                                                           |
| `onDispose(fn)` | function                 | Runs `fn` on shutdown, last registered first.                                                                            |

### Network and offline queues

`context.network.online` follows the browser (`navigator.onLine` and its events) and the outcome of requests: a request that cannot reach its server marks the game offline until one succeeds or the browser reports a connection again. `context.network.queue(name, handler, options)` returns an `OfflineQueue`: items pushed to it are written to the device first, then handed to `handler` in order. A handler that throws keeps the item and retries with exponential backoff; throwing `DropItem` discards it (the server refused it, retrying cannot help). Coming back online, the app resuming (`resume` platform event) and `queue.flush()` retry at once. Items survive restarts.

| Option        | Default  | Meaning                                                           |
| ------------- | -------- | ----------------------------------------------------------------- |
| `retryDelay`  | `1000`   | First retry delay in ms; doubles after each failure.              |
| `maxDelay`    | `300000` | Longest delay between retries (5 minutes).                        |
| `maxAttempts` | `0`      | Attempts before an item is dropped; `0` keeps it until delivered. |
| `maxItems`    | `1000`   | Items kept at most; the oldest are dropped first.                 |

```ts
const scores = context.network.queue<{ points: number }>('scores', async ({ points }) => {
  const response = await fetch(url, { method: 'POST', body: JSON.stringify({ points }) });
  if (response.status === 400) throw new DropItem('refused');
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
});
await scores.push({ points: 1200 });
```

The `http` module wraps this for plain requests: `http.send()`.

## `http` {#http}

| Option        | Default  | Meaning                                                                   |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `baseUrl`     | none     | Prefix of relative paths (`get('/scores')`).                              |
| `timeout`     | `10000`  | Request timeout in ms.                                                    |
| `headers`     | `{}`     | Headers added to every request.                                           |
| `retryDelay`  | `1000`   | First retry delay of queued requests.                                     |
| `maxDelay`    | `300000` | Longest delay between retries.                                            |
| `maxAttempts` | `0`      | Attempts before a queued request is dropped; `0` retries until delivered. |

| Member                                                      | Meaning                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get(path, options?)`, `delete(path)`                       | Request now, resolves with the parsed body (JSON when the server says so).                                                                           |
| `post(path, json?)`, `put`, `patch`                         | Same with a JSON body.                                                                                                                               |
| `request(path, options)`                                    | Full control: `method`, `json` or `body`, `headers`, `query`, `timeout`, `auth`. Resolves with `{ status, headers, data }`.                          |
| `send(path, options)`                                       | Queued request (POST by default): stored on the device, sent in order, retried until the server accepts it; a 4xx other than 408, 425, 429 drops it. |
| `pending`, `flush()`, `on('sent' \| 'failed' \| 'drained')` | Queue state and events.                                                                                                                              |
| `authorize(prefix, provider)`                               | Adds an `Authorization` header to requests whose URL starts with `prefix`; `accounts-oidc` registers the reference server this way.                  |
| `online`                                                    | The shared network state.                                                                                                                            |

Errors: `HttpError` (`status`, `data`) for an error status, `OfflineError` when the server cannot be reached. Requests run from the game, so a web build is subject to CORS: the server must allow the game's origin.

## `sqlite` {#sqlite}

| Option       | Default     | Meaning                                                                                                                                               |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database`   | `'game.db'` | Default database: a file name in the game's data folder (`databases/`).                                                                               |
| `migrations` | `[]`        | Schema steps run once each, in order, when the default database opens; the count is kept in `PRAGMA user_version`. Append, never edit released steps. |

| Member                         | Meaning                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `execute(sql, params?)`        | Write statement; resolves with `{ changes, lastInsertId }`. Without `params` it may hold several statements. |
| `query<T>(sql, params?)`       | Every row, as objects keyed by column.                                                                       |
| `get<T>(sql, params?)`         | First row or `undefined`.                                                                                    |
| `transaction(async (db) => …)` | `BEGIN`/`COMMIT`; an error rolls back. Other calls wait until it ends.                                       |
| `migrate(steps)`               | Applies steps not applied yet, returns the version.                                                          |
| `open(name)`                   | Another database file, with the same methods and `close()`.                                                  |
| `db`                           | The default database object.                                                                                 |

Values bind to `?` placeholders: strings, numbers, booleans (stored as 1/0), `null`, `Uint8Array` (blobs). Statements run one at a time in call order.

Each platform runs real SQLite:

| Platform     | Engine                                                                           | Where the file is                    |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------ |
| Desktop      | better-sqlite3 in the Electron main process (the module's native part, WAL mode) | `<data folder>/databases/<name>`     |
| Android, iOS | Capacitor SQLite (`@blacklight/mobile`)                                          | app-private storage                  |
| Web          | sql.js (SQLite compiled to WebAssembly, loaded on first use as one chunk)        | OPFS, IndexedDB when OPFS is missing |

On the web the database lives in memory and the whole file is written to storage 100 ms after a change and when the page is hidden.

## Cloud saves {#cloud-save}

`cloud-save` keeps the slots of the save system in the cloud: the [reference server](./server) or Steam Cloud. After each save the slot is queued for upload (offline or signed out, it waits); at startup and when the app resumes every slot is synced. The bytes are the save system's portable export, still encrypted.

| Option        | Default    | Meaning                                                                                               |
| ------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `backend`     | `'server'` | `server` (reference server) or `steam` (Steam Cloud through `@blacklight/native`).                    |
| `server`      | accounts   | Reference server URL; defaults to `server` of `accounts-oidc`, whose session authorizes the requests. |
| `conflict`    | `'newest'` | Slot changed on both sides since the last sync: keep the newest, or `ask` (`onConflict`).             |
| `autoUpload`  | `true`     | Upload after each save.                                                                               |
| `syncOnStart` | `true`     | Sync at startup and on resume.                                                                        |

```ts
const cloud = this.game.modules['cloud-save'];
cloud.onConflict(async ({ slot, local, remote }) => {
  const keepCloud = await this.ui.confirm({
    title: `Two versions of ${slot}`,
    message: `This device: ${new Date(local.updatedAt).toLocaleString()}\nCloud: ${new Date(remote.updatedAt).toLocaleString()}`,
    confirm: 'Use the cloud copy',
    cancel: 'Keep this one',
  });
  return keepCloud ? 'remote' : 'local';
});
```

`sync()`, `upload(slot)`, `download(slot)`, `pending` and the events `uploaded`, `downloaded`, `conflict`, `error` are also available. The server detects concurrent writes with revisions; Steam Cloud with the write time stored next to each slot.

## Node packages and native code

Game code runs in a browser, a WebView or the Electron renderer: Node modules do not exist there. Browser packages from npm are bundled by Vite as usual. A game file that imports a Node built-in (`fs`, `node:path`, `child_process`…) or a native addon (a package with `binding.gyp`, or one that loads `.node` files) stops `blacklight dev` and `blacklight build` with a message naming the file and the import:

```text
scenes/title/title.scene.ts imports "node:fs", which only runs in Node.js. Game code runs in a browser, a WebView or the Electron renderer, where Node modules do not exist. Move this code to the native part of a module (defineNative from @blacklight/native, called with platform.invoke; see "Native parts" in the modules guide) or use a browser package instead.
```

Node code belongs in the native part of a module, which runs in the Electron main process and is reached through `platform.invoke`: see [Native parts](./modules-native).

## Limits

- Modules are set up once, before the first scene; they cannot be added or removed while the game runs, and hot reload of a module file reloads the page.
- The Node import check looks at imports written in game files and at packages that ship a native addon. A browser package that itself requires a Node built-in is bundled with Vite's empty browser stub and fails when that code runs.
- `context.saves` needs the save system (`game.save`); `cloud-save` only syncs slots the save system lists.
- On the web, SQLite writes reach storage up to 100 ms after the statement; closing the tab inside that window loses the last change. OPFS needs a secure context (HTTPS or localhost).
- Offline queues retry until delivered by default; a server that keeps answering 5xx keeps the items forever (set `maxAttempts`).
