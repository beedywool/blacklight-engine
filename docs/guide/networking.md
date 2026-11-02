# Networking

`@blacklight/net` adds online play: rooms on a relay server, rollback for action games, lockstep for turn-based games. It is optional; games without it ship none of it.

```sh
pnpm blacklight add @blacklight/net
```

Online play has three parts:

1. **Relay and rooms.** Every machine connects to a relay server, one of them creates a room and gets a code, the others join with the code or from the lobby list. The relay forwards bytes between the members of a room; it never runs game code. See [Relay server](./networking-relay) to host one.
2. **A session.** When the host starts the match, every member gets an `OnlineMatch`: the player slots, a shared seed and the transport. A scene hands it to `rollback()` (action games) or to a `LockstepSession` (turn-based games).
3. **Deterministic simulation.** Machines exchange only inputs, so every machine must compute exactly the same steps from the same inputs. That rules out `Math.random`, `Math.sin` and the clock in simulation code; [Determinism](./networking-determinism) lists the rules and the lint rule that checks them.

[Testing](./networking-testing) runs several instances of a game against a simulated network with latency and loss, faster than real time.

## Rooms and lobby

```ts
import { RelayClient } from '@blacklight/net';

const relay = await RelayClient.connect('wss://relay.example.com', {
  name: 'Ana',
  game: this.game.config.id,
});
const room = await relay.createRoom({ maxPlayers: 4, public: true, data: { mode: 'sumo' } });
this.showCode(room.code); // "K7QXB"
relay.events.on('room', (room) => this.updateLobby(room.members));

// on the other machines
const rooms = await relay.listRooms(); // public rooms of this game that have not started
await relay.joinRoom('k7qxb'); // case does not matter
relay.setReady(true);

// everyone
const match = await relay.match(); // resolves when the host calls relay.start()
this.goto('push-push-online', { match });
```

The address accepts `host`, `host:port` or a full `ws://` / `wss://` URL; without a port it uses 5360. Room codes have five characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0`/`O`, `1`/`I`/`L`), so they read aloud and type on a pad without mistakes.

| `createRoom` option | Default | Meaning                                                                      |
| ------------------- | ------- | ---------------------------------------------------------------------------- |
| `maxPlayers`        | `8`     | Player slots, 1 to 8.                                                        |
| `maxSpectators`     | `8`     | Spectator places (the relay allows up to 32).                                |
| `public`            | `false` | Listed by `listRooms()`; private rooms are joined by code only.              |
| `players`           | `1`     | Local players on this machine (two people on one console joining together).  |
| `data`              | `{}`    | Free JSON for the other members: mode, map, the two settings of a mini-game. |

| `RelayClient` member   | What it does                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `joinRoom(code, opts)` | Enters a room. `{ spectator: true }` watches; it is the only way into a started room.  |
| `setReady(ready)`      | Marks this machine ready. The host starts once every other player is ready.            |
| `start(seed?)`         | Host only. Numbers the players in join order and starts the match for everyone.        |
| `match()`              | Resolves with the `OnlineMatch` when the match starts (at once if it already started). |
| `leave()`, `close()`   | Leaves the room; closes the connection.                                                |
| `room`, `member`       | Current room state and this machine's member id.                                       |
| `ping`                 | Last round trip to the relay in ms, measured every 5 s.                                |
| `events`               | `room` (any change), `start`, `leftRoom`, `close`.                                     |

Refusals reject with a `RelayError` whose `code` says why: `room-not-found`, `room-full`, `started` (join as a spectator), `not-host`, `not-ready` (the message names who), `version` (relay and game use different protocol versions), `server-full`. When the host leaves before the start, the room goes to the next player; an empty room closes.

### LAN hosting

The desktop app can host the relay itself, so players on the same network play without an internet server:

```ts
import { hostLan, RelayClient } from '@blacklight/net';

const lan = await hostLan(this.game); // { port: 5360, urls: ['ws://192.168.1.20:5360'], local: 'ws://127.0.0.1:5360' }
const relay = await RelayClient.connect(lan.local, { name: 'Host', game: this.game.config.id });
const room = await relay.createRoom();
this.showCode(room.code, lan.urls[0]); // the others type this address and the code
```

`hostLan` calls the `relay` native module of the desktop build, which runs the same server in Electron's main process. It throws on the web and on mobile, where a game cannot open a port. `stopLan(game)` stops it. The other machines need the host's address: the relay does not broadcast itself on the network.

## Rollback

Rollback hides latency in action games. Each machine sends only its inputs. To simulate a step, it uses the inputs it has and predicts the missing ones (a player keeps doing what they did last). When a real input arrives and differs from the prediction, the session loads the snapshot of that step and simulates again up to the present, within the same frame. Players see their own input at once; other players' actions show up corrected a few steps later.

```ts
import { Scene } from '@blacklight/core';
import { rollback, type OnlineMatch, type SceneRollback } from '@blacklight/net';

export default class PushPushOnline extends Scene<{ match: OnlineMatch }> {
  net!: SceneRollback;

  override create({ match }: { match: OnlineMatch }) {
    // First: seeds this.random with the match seed.
    this.net = rollback(this, match, { inputs: ['left', 'right', 'up', 'down', 'action'] });
    for (const player of match.players)
      this.spawn(Wrestler, { x: 120 * player.number, y: 300, player: player.number });
    this.net.events.on('desync', (d) => console.error(`Desync at step ${d.frame}`));
  }
}
```

From then on the scene's fixed step runs through the session. Simulation code reads input as for local players: `this.input` of an object whose `player` is 3 is player 3 of the match, wherever that player sits. On the machine of player 3, local player 1 (keyboard, first pad) is read and sent as player 3. `pressed` and `released` are computed from the previous step's input, so they are identical on every machine.

| `rollback` option  | Default       | Meaning                                                                                                             |
| ------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `inputs`           | required      | Actions sent over the network: a list of button actions, `{ buttons, analog }`, or an `InputCodec`.                 |
| `delay`            | `2`           | Steps between pressing a button and its effect. Latency up to that much needs no rollback. Changeable during play.  |
| `maxRollback`      | `8`           | Most steps simulated ahead of the slowest player. Beyond it the session waits for input (the game freezes briefly). |
| `checksumInterval` | `30`          | Steps between two checksums of the confirmed state.                                                                 |
| `sample`           | local devices | `(player, step) => Uint8Array` for bots, replays and tests.                                                         |

Buttons travel as one bit each, analog actions (`analog: ['throttle']`) as one byte (256 steps). Four directions and a button fit in one byte per player per step. The pointer does not travel: give aiming its own analog actions.

### Choosing the delay

`delay` trades responsiveness for fewer corrections. With a round trip of 100 ms (6 steps at 60 Hz), a delay of 3 removes most rollbacks; 1 or 2 feels sharper and corrects more. `net.stats.rtt` holds the measured round trip to each member in steps; `net.delay = Math.ceil(rtt / 2) - 2` is a reasonable rule, applied between rounds. Raising the delay repeats the current input to fill the gap; lowering it skips sampling until the steps catch up.

### What the session needs from the scene

- **Everything that changes the outcome is in the snapshot.** Objects and their fields, behaviors, the scene's random generator, timers and collision contacts are restored by `scene.restore()` ([Snapshots](./snapshots)). Fields of the `Scene` subclass are not: keep match state (scores, round, timer) on an object.
- **Tweens are not restored.** Use them for display only (a score popping), not for movement that matters.
- **Count steps, prefer fields to timers.** A timer callback that refers to an object destroyed and re-created by a rollback acts on the old instance. `respawnAt = this.scene.steps + 120` tested in `update()` survives anything.
- **Sounds play once.** While steps are replayed, `this.audio.play()` returns a silent handle. `net.replaying` tells other effects (particles, rumble) to skip.
- **Menus do not freeze the match.** A pause menu blocks input on that machine only; the session keeps simulating every player with their network input, and this machine's player sends neutral input while the menu is open.

### Spectators and players who leave

Spectators (`joinRoom(code, { spectator: true })`) receive every input and simulate confirmed steps only, a little behind the players, without prediction. A spectator that joins a started match asks the first player for the confirmed state and starts from there.

When a member leaves, the relay tells everyone; from the step after its last input, its players have neutral input on every machine (`leave` event, `net.connected(player)` returns `false`). The step is the same everywhere because every member received the same inputs before the notice.

### Desync detection

Every `checksumInterval` steps, each machine hashes its confirmed state (the scene snapshot as JSON with sorted keys) and sends the hash with its inputs. When two hashes differ, the session emits `desync` once per member and step, asks that member for its state, and emits `desyncReport` with what differs:

```ts
this.net.events.on('desyncReport', (report) => {
  console.table(report.differences);
  // [{ path: 'objects[id=7].core.x', local: 212.50000000000003, remote: 212.5 }, …]
});
```

Objects are matched by id, so a missing object is one line. The session does not repair a desync: the match goes on diverging, and the report is for the developer.

| Event          | Payload                                                 |
| -------------- | ------------------------------------------------------- |
| `desync`       | `{ frame, member, local, remote }` (checksums).         |
| `desyncReport` | The same plus `differences: { path, local, remote }[]`. |
| `leave`        | `{ member, players, frame }`.                           |
| `stall`        | `{ frame, waitingFor }`: waiting for remote input.      |
| `synced`       | `{ frame }`: a late spectator received the state.       |

`net.stats` counts `rollbacks`, `replayedFrames`, `deepestRollback`, `stalls`, `waits` (steps skipped so a faster machine lets the others catch up) and `rtt` per member.

`RollbackSession` works without a scene: give it any object with `save`, `load`, `step(inputs, previous, frame)`, `serialize` and `deserialize`, and call `session.tick()` once per fixed step.

## Lockstep for turn-based games

Card games, board games and strategy turns need no prediction: a turn completes when every required move arrived, and every machine applies the same moves in the same order.

```ts
import { LockstepSession } from '@blacklight/net';

const turns = new LockstepSession<{ card: number }>(match, {
  order: 'simultaneous',
  state: () => JSON.stringify(this.table), // compared across machines after each turn
});
turns.events.on('turn', ({ turn, moves }) => {
  moves.forEach((move, i) => move && this.play(i + 1, move.card));
});

// when the local player picks a card
if (turns.canPlay()) turns.submit({ card: 3 });
// every frame
turns.poll();
```

| Option           | Default          | Meaning                                                                                              |
| ---------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `order`          | `'simultaneous'` | `'simultaneous'`: every player moves each turn. `'alternate'`: one player per turn, in player order. |
| `state`          | none             | Text or number describing the state after a turn; a difference emits `desync`.                       |
| `resendInterval` | `10`             | Polls between resends of moves not acknowledged yet (lost messages only delay the turn).             |

Moves are any JSON value. `submit` throws when it is not that player's turn or the move was already sent; `waitingFor()` lists who the turn waits for. A player who leaves is skipped from the turn after their last move (`null` in `moves`).

## Limits

- Up to 8 players per room, and spectators. Players on one machine join together (`players: 2`); the relay counts each as a slot.
- Rollback needs a deterministic simulation: same steps, same inputs, same result on every engine. See [Determinism](./networking-determinism).
- Inputs travel over the relay's WebSocket (TCP). Messages are not lost, but a lost TCP packet delays everything behind it; the session would also run on an unreliable transport (the test harness drops 2 % of messages), but none ships in 1.0.
- The relay is not authoritative: it does not check inputs. A modified client can send any input for its own players (L4: client-side protection deters, it does not guarantee).
- A late spectator starts from the JSON snapshot, which has no timers: games that keep match logic in timers diverge for that spectator. Disconnected players cannot rejoin a started match.
- A rollback longer than `maxRollback` steps is never done: with a one-way latency above about `(maxRollback + delay)` steps, the game pauses for input regularly.
- LAN hosting needs the desktop build. Players type the host's address; there is no automatic discovery.
- After a desync the match keeps running out of sync; the session reports, it does not resynchronize.
