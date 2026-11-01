// NET-01 + NET-04 end to end without a browser: two party-game machines (headless games, no
// rendering) play Push-Push online through the real relay server on 127.0.0.1, going through the
// lobby the way the game's OnlineLobby does. This is the automated online check of the Windows CI
// runner, whose software rendering freezes two browser pages (see DECISIONS.md); it runs on every
// OS because it is cheap and covers the relay + rollback path on its own.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RelayClient, type OnlineMatch, type RoomState } from '@blacklight/net';
import { startRelay, type RelayServer } from '../src/index';
import { miniGame } from '../../../templates/party-game/party/catalog';
import { canStart, host, roomGame } from '../../../templates/party-game/party/online';
import PushPush from '../../../templates/party-game/scenes/push-push/push-push.scene';
import {
  bot,
  onlineInstance,
  type OnlineInstance,
} from '../../../templates/party-game/test/harness';

/** Steps each machine must reach: well past the intro and "Go!" (150 steps), ~20 checksums. */
const STEPS = 600;
/** Wall-clock budget of the lobby and of the match, each (both take well under a second locally). */
const BUDGET_MS = 30_000;

let relay: RelayServer;
const clients: RelayClient[] = [];

beforeAll(async () => {
  relay = await startRelay({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  for (const c of clients) c.close();
  await relay.close();
});

async function connect(name: string): Promise<RelayClient> {
  const client = await RelayClient.connect(relay.local, { name, game: 'blacklight-party' });
  clients.push(client);
  return client;
}

/** Resolves with `promise`, or fails after `ms` saying which stage did not finish. */
function within<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${stage}: nothing after ${ms / 1000} s (relay ${relay.local}).`)),
      ms,
    );
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error: unknown) => (clearTimeout(timer), reject(error)),
    );
  });
}

function describeMachine(label: string, machine: OnlineInstance<PushPush>): string {
  const { session, scene } = machine;
  const checksums = [...session.checksums].slice(-3).map(([f, h]) => `${f}:${h}`);
  return (
    `${label}: frame ${session.frame}, ${session.checksums.size} checksums (last ${checksums.join(' ') || 'none'}), ` +
    `stalls ${session.stats.stalls}, rollbacks ${session.stats.rollbacks}, finished ${scene.referee.finished}`
  );
}

describe('party-game online over the relay (headless)', () => {
  it('two machines create, join and play Push-Push through the relay without desync', async () => {
    // Lobby, as OnlineLobby.vue: the host creates a room for the mini-game, the guest joins by
    // code and gets ready, the host starts when canStart says so.
    const hostClient = await connect('HOST');
    const guestClient = await connect('GUEST');
    const room = await within(
      host(hostClient, { game: 'push-push', settings: [0, 1] }, miniGame('push-push').maxPlayers),
      BUDGET_MS,
      'host creates the room',
    );
    const hostMatch = hostClient.match();
    const joined = await within(guestClient.joinRoom(room.code), BUDGET_MS, 'guest joins by code');
    const guestMatch = guestClient.match();
    const startable = new Promise<RoomState>((resolve) => {
      const check = (state: RoomState) => canStart(hostClient, 2) && resolve(state);
      hostClient.events.on('room', check);
    });
    guestClient.setReady(true);
    await within(startable, BUDGET_MS, 'host sees the guest ready');
    await within(hostClient.start(), BUDGET_MS, 'host starts the match');
    const matches: OnlineMatch[] = await within(
      Promise.all([hostMatch, guestMatch]),
      BUDGET_MS,
      'both machines receive the match',
    );

    // Each machine plays the mini-game its room says, like the match scene does.
    const machines = await Promise.all(
      [room, joined].map((state, i) => {
        const choice = roomGame(state);
        expect(choice).toEqual({ game: 'push-push', settings: [0, 1] });
        return onlineInstance(PushPush, choice.game, matches[i]!, {
          settings: choice.settings,
          script: bot,
        });
      }),
    );
    const desyncs: string[] = [];
    machines.forEach((m, i) =>
      m.session.events.on('desync', (event) =>
        desyncs.push(`machine ${i + 1}: ${JSON.stringify(event)}`),
      ),
    );

    // Real time: tick both, then yield so the WebSocket messages flow. A session more than
    // maxRollback steps ahead of the other's input stalls until it arrives.
    const deadline = Date.now() + BUDGET_MS;
    const [a, b] = machines as [OnlineInstance<PushPush>, OnlineInstance<PushPush>];
    while (Math.min(a.session.frame, b.session.frame) < STEPS && Date.now() < deadline) {
      a.tick();
      b.tick();
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    const report = `\n${describeMachine('host', a)}\n${describeMachine('guest', b)}`;
    expect(
      Math.min(a.session.frame, b.session.frame),
      `both machines reach step ${STEPS} within ${BUDGET_MS / 1000} s${report}`,
    ).toBeGreaterThanOrEqual(STEPS);
    expect(desyncs, `no desync${report}`).toEqual([]);

    let common = 0;
    for (const [frame, hash] of a.session.checksums) {
      if (!b.session.checksums.has(frame)) continue;
      expect(b.session.checksums.get(frame), `checksum of step ${frame}${report}`).toBe(hash);
      common++;
    }
    expect(common, `common checksums${report}`).toBeGreaterThanOrEqual(10);
  }, 120_000);
});
