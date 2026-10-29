# Testing online play

`@blacklight/net/testing` runs several instances of an online game in one process, linked by a simulated network with latency, jitter, loss and duplicates. Time is virtual: ten minutes of a four-player match run in a few seconds, and the same seed gives the same run every time, so a desync found once is found again.

```ts
// test/push-push-online.spec.ts (Vitest)
import { expect, it } from 'vitest';
import { headlessGame, headlessScene, simulateMatch } from '@blacklight/net/testing';
import PushPushOnline from '../scenes/push-push-online/push-push-online.scene';
import { botInput } from '../scenes/push-push-online/bots';

it('4 players, 150 ms, 2 % loss: no desync over 10 minutes', async () => {
  const result = await simulateMatch({
    players: 4,
    frames: 60 * 60 * 10,
    network: { latency: 150, jitter: 20, loss: 0.02 },
    create: async (match) => {
      const game = headlessGame({ width: 640, height: 360 });
      const scene = await headlessScene(
        PushPushOnline,
        'push-push-online',
        { match, bots: true },
        game,
      );
      return {
        tick: () => {
          game.input.update();
          scene.step(game.time.dt);
        },
        session: scene.net.session,
      };
    },
  });
  expect(result.desyncs).toEqual([]);
});
```

The scene decides where local input comes from: here it passes `sample: botInput` to `rollback()` when `bots` is set. A bot must be a pure function of the player number and the step, so every run is the same.

## Simulated network

| `network` option | Default     | Meaning                                                                           |
| ---------------- | ----------- | --------------------------------------------------------------------------------- |
| `latency`        | `0`         | One-way delay in ms.                                                              |
| `jitter`         | `0`         | Extra delay, uniform between 0 and `jitter` ms. Messages can arrive out of order. |
| `loss`           | `0`         | Probability that a message is lost (0–1).                                         |
| `duplicate`      | `0`         | Probability that a message arrives twice.                                         |
| `seed`           | `'network'` | Seed of losses and delays (`simulateMatch` uses its own `seed`).                  |

`SimulatedNetwork` can also be used directly: `network.matches({ players, spectators, seed })` returns one `OnlineMatch` per member (player `n` is member `n`, spectators follow), `network.advance(ms)` moves the clock and delivers what arrived, `network.disconnect(member)` simulates a player closing the game (the others get the leave notice at once). `network.stats` counts sent, delivered, lost and duplicated messages.

## `simulateMatch`

| Option       | Default   | Meaning                                                                                             |
| ------------ | --------- | --------------------------------------------------------------------------------------------------- |
| `players`    | required  | Players, one per member.                                                                            |
| `spectators` | `0`       | Spectator members.                                                                                  |
| `frames`     | required  | Fixed steps to run.                                                                                 |
| `network`    | lossless  | Conditions above.                                                                                   |
| `seed`       | `'match'` | Match seed and network seed.                                                                        |
| `create`     | required  | Builds one instance from its match; returns `{ tick, session }`.                                    |
| `onTick`     | none      | Called after each step with the instances and the network (assertions, disconnects, delay changes). |
| `tickRate`   | `60`      | Steps per second of virtual time.                                                                   |

Each step, the network advances by one step's time, then every instance ticks in member order. The result holds:

| Field          | Content                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| `desyncs`      | Every `desync` event, with the `reporter` member.                          |
| `checksums`    | Confirmed `[step, hash]` pairs of each instance.                           |
| `agreedFrames` | Checksum steps every instance computed with the same hash.                 |
| `frames`       | Step reached by each instance (lower than `frames` when they had to wait). |
| `stats`        | Each session's `stats` (rollbacks, replayed steps, stalls, round trips).   |
| `network`      | The network's counters.                                                    |

`headlessGame()` is a `Game` without renderer, DOM or audio: enough for scenes, objects, collisions, input and snapshots in Node. `headlessScene(Class, name, params, game)` creates a scene on it and runs `create(params)`. Objects spawned by class are registered for restores; spawning by name needs the class to have been spawned once.

## Across engines

To check that a scene is deterministic across JavaScript engines, run the same `simulateMatch` in Node (V8) and in a WebKit page (JavaScriptCore) and compare `checksums`. The engine's gate does it in `e2e/net.spec.ts` with Playwright: the fixture page exposes the run on `window`, the test compares it with the run in the test process. Playwright's WebKit needs its system libraries (`pnpm exec playwright install --with-deps webkit`); `bun` also runs JavaScriptCore and can run the same script from the command line.

## In the browser

The harness runs in a page too. The fixture's lobby (`e2e/fixtures/net`, `pnpm --filter blacklight-fixture-net dev`) plays the local player against three headless bot instances over a simulated 150 ms, 2 % loss network, all in the page: a quick way to feel rollback without a second machine.

## Limits

- The harness ticks every instance at the same rate: clock drift between real machines is not simulated, so the session's time synchronization (a machine running ahead waits a step now and then) is not exercised by it.
- `headlessGame` has no renderer: code that needs textures, text measurement or the DOM in `create()` does not run in Node.
- Disconnects in the simulated network drop the messages still in flight to and from that member, like the relay; with loss enabled, members may disagree on the leave step (the real relay is lossless).
