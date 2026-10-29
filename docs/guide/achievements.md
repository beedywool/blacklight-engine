# Achievements

The `achievements` module gives one API for achievements and leaderboards whatever the store: Steam, Game Center, Google Play Games, or the [reference server](./server). Every unlock is recorded on the device first and then delivered through an offline queue, so an achievement earned on a plane, before signing in, or while Steam is restarting still arrives.

```sh
blacklight add achievements
```

```ts
// game.config.ts
modules: {
  http: {},
  achievements: { ids: ['first-win', 'collector', 'speedrunner'] },
},
```

```ts
// when the player wins
const { achievements } = this.game.modules;
if (await achievements.unlock('first-win')) this.ui.open(AchievementToast, { id: 'first-win' });
await achievements.progress('collector', this.coins, 100); // unlocks at 100
await achievements.submitScore('high-score', this.points);

// results screen
const top = await achievements.leaderboard('high-score', { limit: 10 });
```

## Options

| Option    | Default  | Meaning                                                                                                                             |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `backend` | `'auto'` | `auto`, `steam`, `gamecenter`, `playgames`, `server` or `local` (device only).                                                      |
| `server`  | accounts | Reference server URL; defaults to `server` of `accounts-oidc`, whose session authorizes the requests.                               |
| `ids`     | none     | Known achievement ids. `unlock()` and `progress()` refuse other ids, so a typo fails during development instead of never unlocking. |

`auto` picks, in order: Steam when the game was started by Steam (`platform.steam`), Game Center on iOS, Google Play Games on Android, the reference server when a server URL is known, otherwise `local`. `achievements.backend` tells which one is in use.

## API

| Member                                  | Meaning                                                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `unlock(id)`                            | Records the unlock on the device and queues it; resolves `true`, or `false` when it was already unlocked.                        |
| `isUnlocked(id)`, `list()`              | Local state: unlocks of this device and those merged by `sync()`.                                                                |
| `progress(id, current, max)`            | Keeps progress on the device; reaching `max` unlocks. `progressOf(id)` reads it back.                                            |
| `submitScore(board, score)`             | Queues a score for a leaderboard.                                                                                                |
| `leaderboard(board, { limit, offset })` | Reads a leaderboard (needs the network): `[{ rank, name, score }]`. Equal scores share a rank on the reference server.           |
| `sync()`                                | Reference server: merges unlocks from other devices and resends anything the server lacks. Every backend: retries the queue now. |
| `pending`                               | Unlocks and scores not delivered yet.                                                                                            |
| `reset()`                               | Clears the local state (development builds only).                                                                                |
| `on(event, listener)`                   | `unlock` (on this device, or merged from the server), `progress`, `synced` (queue empty).                                        |

## Backends

| Backend      | Unlock                                                | Score                                               | Leaderboard                                    |
| ------------ | ----------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `steam`      | `platform.invoke('steam', 'activateAchievement', id)` | `invoke('steam', 'uploadScore', board, score)`      | `invoke('steam', 'getScores', board, limit)`   |
| `gamecenter` | `platform.invoke('gamecenter', 'unlock', id)`         | `invoke('gamecenter', 'submitScore', board, score)` | `invoke('gamecenter', 'scores', board, limit)` |
| `playgames`  | `platform.invoke('playgames', 'unlock', id)`          | `invoke('playgames', 'submitScore', board, score)`  | `invoke('playgames', 'scores', board, limit)`  |
| `server`     | `POST /v1/games/<id>/achievements/<achievement>`      | `POST …/leaderboards/<board>/scores`                | `GET …/leaderboards/<board>`                   |
| `local`      | device only                                           | device only (not kept)                              | not available                                  |

The desktop package implements the `steam` calls with Steamworks, the mobile package the `gamecenter` and `playgames` calls. Achievement and leaderboard ids are the ones declared in each store (Steamworks partner site, App Store Connect, Play Console) and in the reference server's `games.json`; use the same ids everywhere so one `unlock('first-win')` works on every target.

## Offline and signed out

Delivery goes through the module's offline queue: items are written to the device, sent in order, and retried with backoff (from 2 s up to 5 minutes) when the network, Steam or the server is unavailable. On the reference server, a `401` (no session yet) keeps the item until the player signs in or plays as a guest; an id the server does not know (`404 unknown_achievement`) is dropped with a warning. Unlock times are those of the device; the server keeps the first time it receives and replaces times in the future with its own clock.

## Limits

- Client-side unlocks are a deterrent, not a guarantee (L4): a modified client can call `unlock()`. The reference server refuses unknown ids; achievements that must be earned fairly need server-side checks in your own game server.
- Progress is kept on the device only; stores that show progress bars (Steam stats) are not updated with it.
- `leaderboard()` needs the network and returns the store's display names; there is no offline copy.
- Game Center and Google Play Games sign-in prompts are the mobile package's; when the player refuses them, unlocks stay queued.
