import { Scene } from '@blacklight/core';
import { RelayClient, type DesyncEvent, type OnlineMatch } from '@blacklight/net';
import { headlessGame, headlessScene, SimulatedNetwork } from '@blacklight/net/testing';
import type PushPushOnline from '../push-push-online/push-push-online.scene';
import { mathFingerprint, runGate } from './gate';

/** What the e2e test reads from the page. */
export interface NetState {
  status: string;
  room?: string;
  error?: string;
  desyncs: DesyncEvent[];
}

declare global {
  interface Window {
    netGate?: { runGate: typeof runGate; mathFingerprint: typeof mathFingerprint };
    netState?: NetState;
  }
}

/**
 * Entry of the fixture, driven by the URL:
 * - `?gate`: exposes the determinism run (`window.netGate`) and stays idle;
 * - `?relay=ws://host:port&host&players=2` creates a room and starts when that many are ready;
 * - `?relay=ws://host:port&room=CODE` joins a room;
 * - nothing: plays against three bots over a simulated network (150 ms, 2 % loss) in this page.
 * `&bots` makes the local player a bot too.
 */
export default class Lobby extends Scene {
  override create(): void {
    const params = new URLSearchParams(location.search);
    const state: NetState = { status: 'starting', desyncs: [] };
    window.netState = state;
    if (params.has('gate')) {
      window.netGate = { runGate, mathFingerprint };
      state.status = 'gate';
      return;
    }
    const relay = params.get('relay');
    const bots = params.has('bots');
    const run = relay ? this.online(relay, params, state) : this.simulated(state);
    run
      .then((match) => this.play(match, bots, state))
      .catch((error: unknown) => {
        state.status = 'error';
        state.error = String(error);
      });
  }

  private async online(
    url: string,
    params: URLSearchParams,
    state: NetState,
  ): Promise<OnlineMatch> {
    const client = await RelayClient.connect(url, {
      name: params.get('name') ?? `Player ${Math.floor(performance.now())}`,
      game: this.game.config.id,
    });
    const code = params.get('room');
    if (code) {
      await client.joinRoom(code);
      client.setReady(true);
      state.status = 'joined';
      return client.match();
    }
    const wanted = Number(params.get('players') ?? 2);
    const room = await client.createRoom({ maxPlayers: wanted });
    state.room = room.code;
    state.status = 'hosting';
    await new Promise<void>((resolve) => {
      const check = () => {
        const r = client.room!;
        const others = r.members.filter((m) => m.id !== r.host && !m.spectator);
        if (others.length + 1 >= wanted && others.every((m) => m.ready)) resolve();
      };
      client.events.on('room', check);
      check();
    });
    return client.start();
  }

  /** This page plays player 1; three headless instances play the others over a fake network. */
  private async simulated(state: NetState): Promise<OnlineMatch> {
    const network = new SimulatedNetwork({ latency: 150, jitter: 20, loss: 0.02 });
    const [mine, ...others] = network.matches({ players: 4, seed: 'demo' });
    const { default: PushPush } = await import('../push-push-online/push-push-online.scene');
    const instances = await Promise.all(
      others.map(async (match) => {
        const game = headlessGame({ width: 640, height: 360 });
        const scene = await headlessScene(
          PushPush,
          'push-push-online',
          { match, bots: true, delay: 3 },
          game,
        );
        return { game, scene };
      }),
    );
    this.game.events.on('step', () => {
      network.advance(1000 / this.game.config.tickRate);
      for (const { game, scene } of instances) {
        game.input.update();
        scene.step(game.time.dt);
      }
    });
    state.status = 'simulated';
    return mine!;
  }

  private async play(match: OnlineMatch, bots: boolean, state: NetState): Promise<void> {
    await this.goto('push-push-online', { match, bots, delay: 3 });
    const scene = this.game.scene as unknown as PushPushOnline;
    scene.net.events.on('desync', (event) => state.desyncs.push(event));
    state.status = 'playing';
  }
}
