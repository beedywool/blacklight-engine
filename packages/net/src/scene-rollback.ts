import type { ActionName, PlayerInput, Scene, SceneSnapshot, SoundHandle } from '@blacklight/core';
import { stableStringify } from './checksum';
import { InputCodec, type ActionState, type InputLayout } from './codec';
import { RollbackSession, type RollbackOptions } from './rollback';
import type { OnlineMatch } from './transport';

/** Options of {@link rollback}. */
export interface SceneRollbackOptions extends Omit<RollbackOptions, 'inputSize' | 'sample'> {
  /** Actions that travel over the network: a list of button actions, a layout or a codec. */
  inputs: readonly ActionName[] | InputLayout | InputCodec;
  /**
   * Reads a local player's input. By default local player `k` (1-based, in `match.local` order)
   * is `input.player(k)` of this machine. Tests and bots pass their own.
   */
  sample?: (player: number, frame: number) => Uint8Array;
}

/** What the adapter changes on `PlayerInput` while it simulates (internal core methods). */
interface InjectablePlayer {
  readonly stateMap: Map<string, ActionState>;
  setStates(states: Map<string, ActionState>): void;
}

const SILENT: SoundHandle = {
  key: '',
  ended: Promise.resolve(),
  stop() {},
  setVolume() {},
  setPosition() {},
};

/**
 * A rollback session running a scene: the scene's `step` goes through the session, which feeds
 * every player's network input to `input.player(n)` and restores snapshots on rollback.
 * Created by {@link rollback}; keep the returned object to read `frame`, `replaying` and `events`.
 *
 * @example
 * ```ts
 * this.net = rollback(this, match, { inputs: ['left', 'right', 'action'] });
 * if (!this.net.replaying) this.audio.play('hit');
 * this.net.events.on('leave', ({ players }) => this.showLeft(players));
 * ```
 */
export class SceneRollback {
  /** The underlying session (checksums, stats, input delay). */
  readonly session: RollbackSession<SceneSnapshot>;
  /** Packs the scene's actions for the network. */
  readonly codec: InputCodec;
  private readonly original: (dt: number) => void;
  private dt: number;
  private local: Uint8Array[] = [];
  private stepping: number | undefined;
  private disposed = false;

  constructor(
    /** The scene played online. */
    readonly scene: Scene<never>,
    /** The match being played. */
    readonly match: OnlineMatch,
    options: SceneRollbackOptions,
  ) {
    this.codec =
      options.inputs instanceof InputCodec
        ? options.inputs
        : new InputCodec(
            Array.isArray(options.inputs)
              ? { buttons: options.inputs as readonly ActionName[] }
              : (options.inputs as InputLayout),
          );
    // Same random sequence on every machine, whatever happened before the match.
    scene.random.seed(match.seed);
    this.dt = scene.game.time.dt;
    this.original = scene.step.bind(scene);
    const sample = options.sample ?? ((player: number) => this.local[match.local.indexOf(player)]!);
    this.session = new RollbackSession(match, this.game(), {
      ...options,
      inputSize: this.codec.size,
      sample,
    });
    scene.step = (dt: number) => this.tick(dt);
    scene.disposables.add(() => this.dispose());
  }

  private game() {
    return {
      save: () => this.scene.snapshot(),
      load: (state: SceneSnapshot) => this.scene.restore(state),
      step: (inputs: readonly Uint8Array[], previous: readonly Uint8Array[], frame: number) => {
        inputs.forEach((input, i) => {
          const player = this.scene.game.input.player(i + 1) as unknown as InjectablePlayer;
          player.setStates(this.codec.states(input, previous[i]!));
        });
        this.stepping = frame;
        try {
          this.original(this.dt);
        } finally {
          this.stepping = undefined;
        }
      },
      serialize: (state: SceneSnapshot) => stableStringify({ ...state, memory: undefined }),
      deserialize: (text: string) => JSON.parse(text) as SceneSnapshot,
    };
  }

  private tick(dt: number): void {
    if (this.disposed) return this.original(dt);
    this.dt = dt;
    const input = this.scene.game.input;
    // Local devices are read before the network inputs replace the players' states.
    this.local = this.match.local.map((_, k) => this.codec.read(input.player(k + 1)));
    const players = input.players as unknown as InjectablePlayer[];
    const saved = players.map((p) => p.stateMap);
    const blocked = input.blocked;
    const audio = this.scene.game.audio;
    const play = audio.play;
    // A modal screen on one machine must not freeze the simulation on that machine only.
    input.blocked = false;
    audio.play = (...args) => (this.session.replaying ? SILENT : play.apply(audio, args));
    try {
      this.session.tick();
    } finally {
      audio.play = play;
      input.blocked = blocked;
      players.forEach((p, i) => p.setStates(saved[i]!));
    }
  }

  /** Step being simulated (during `update`), or the next one. */
  get frame(): number {
    return this.stepping ?? this.session.frame;
  }

  /** `true` while steps run again after a rollback: skip effects that must not repeat. */
  get replaying(): boolean {
    return this.session.replaying;
  }

  /** The session's events: `desync`, `desyncReport`, `leave`, `stall`, `synced`. */
  get events() {
    return this.session.events;
  }

  /** The session's counters: rollbacks, stalls, round trips (for a debug overlay). */
  get stats() {
    return this.session.stats;
  }

  /** Steps of input delay; can change during the match. */
  get delay(): number {
    return this.session.delay;
  }

  set delay(steps: number) {
    this.session.delay = Math.max(0, Math.round(steps));
  }

  /**
   * `false` once the machine of `player` left. Deterministic inside the simulation: every
   * machine sees the player leave at the same step.
   */
  connected(player: number): boolean {
    return this.session.connected(player, this.frame);
  }

  /** The `PlayerInput` of player `n` of the match (what simulation code reads). */
  player(n: number): PlayerInput {
    return this.scene.game.input.player(n);
  }

  /** Stops the session; the scene steps on its own again. Called when the scene ends. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.dispose();
    delete (this.scene as { step?: unknown }).step;
  }
}

/**
 * Plays a scene online with rollback (NET-02). Call it first in `create()`, before spawning
 * anything random: it seeds `scene.random` with the match seed. From then on every fixed step
 * runs through the session; simulation code reads `input.player(n)` (or `this.input` of an
 * object whose `player` is `n`) as for local players.
 *
 * @example
 * ```ts
 * export default class PushPushOnline extends Scene<{ match: OnlineMatch }> {
 *   net!: SceneRollback;
 *
 *   create({ match }: { match: OnlineMatch }) {
 *     this.net = rollback(this, match, { inputs: ['left', 'right', 'up', 'down', 'action'] });
 *     for (const p of match.players) this.spawn(Wrestler, { x: 200 * p.number, y: 300, player: p.number });
 *     this.net.events.on('desync', (d) => console.error('desync at step', d.frame));
 *   }
 * }
 * ```
 */
export function rollback(
  scene: Scene<never>,
  match: OnlineMatch,
  options: SceneRollbackOptions,
): SceneRollback {
  return new SceneRollback(scene, match, options);
}
