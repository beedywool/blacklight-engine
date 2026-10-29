// NET-05: several game instances in one process, linked by a simulated network with latency,
// jitter and loss. Time is virtual, so ten minutes of play run in seconds and every run with the
// same seed gives the same result.
import {
  InputManager,
  Random,
  type EventBus,
  type Game,
  type GameObject,
  type Scene,
} from '@blacklight/core';
import type { DesyncEvent, RollbackEvents, RollbackStats } from './rollback';
import type { OnlineMatch, Transport, Unlisten } from './transport';

/** Network conditions of a {@link SimulatedNetwork}. */
export interface NetworkConditions {
  /** One-way delay in ms. @defaultValue `0` */
  latency?: number;
  /** Extra delay, uniform in [0, jitter] ms; messages can arrive out of order. @defaultValue `0` */
  jitter?: number;
  /** Probability (0–1) that a message is lost. @defaultValue `0` */
  loss?: number;
  /** Probability (0–1) that a message arrives twice. @defaultValue `0` */
  duplicate?: number;
  /** Seed of the losses and delays. @defaultValue `'network'` */
  seed?: string | number;
}

interface InFlight {
  at: number;
  order: number;
  to: number;
  from: number;
  data: Uint8Array;
}

/**
 * A deterministic fake network between members of a match. Messages are delivered when
 * {@link advance} moves the virtual clock past their arrival time.
 *
 * @example
 * ```ts
 * const network = new SimulatedNetwork({ latency: 150, jitter: 30, loss: 0.02 });
 * const matches = network.matches({ players: 4 });
 * // each tick: network.advance(1000 / 60); then tick every instance
 * ```
 */
export class SimulatedNetwork {
  /** Virtual time in ms. */
  now = 0;
  readonly stats = { sent: 0, delivered: 0, lost: 0, duplicated: 0 };
  private readonly random: Random;
  private readonly conditions: Required<Omit<NetworkConditions, 'seed'>>;
  private readonly members = new Map<
    number,
    { message: Set<(data: Uint8Array, from: number) => void>; leave: Set<(member: number) => void> }
  >();
  private queue: InFlight[] = [];
  private order = 0;

  constructor(conditions: NetworkConditions = {}) {
    this.conditions = {
      latency: conditions.latency ?? 0,
      jitter: conditions.jitter ?? 0,
      loss: conditions.loss ?? 0,
      duplicate: conditions.duplicate ?? 0,
    };
    this.random = new Random(conditions.seed ?? 'network');
  }

  /** The transport of one member. */
  connect(member: number): Transport {
    const listeners = {
      message: new Set<(data: Uint8Array, from: number) => void>(),
      leave: new Set<(member: number) => void>(),
    };
    this.members.set(member, listeners);
    return {
      send: (data, to) => {
        const targets =
          to === undefined ? [...this.members.keys()].filter((m) => m !== member) : [to];
        for (const target of targets) this.post(member, target, data);
      },
      onMessage: (listener): Unlisten => {
        listeners.message.add(listener);
        return () => listeners.message.delete(listener);
      },
      onLeave: (listener): Unlisten => {
        listeners.leave.add(listener);
        return () => listeners.leave.delete(listener);
      },
    };
  }

  private post(from: number, to: number, data: Uint8Array): void {
    this.stats.sent++;
    if (this.random.chance(this.conditions.loss)) {
      this.stats.lost++;
      return;
    }
    const copies = this.random.chance(this.conditions.duplicate) ? 2 : 1;
    if (copies === 2) this.stats.duplicated++;
    for (let i = 0; i < copies; i++) {
      const at = this.now + this.conditions.latency + this.random.float(0, this.conditions.jitter);
      this.queue.push({ at, order: this.order++, to, from, data: data.slice() });
    }
  }

  /** Moves the clock forward and delivers what arrived, in arrival order. */
  advance(ms: number): void {
    this.now += ms;
    const due = this.queue
      .filter((m) => m.at <= this.now)
      .sort((a, b) => a.at - b.at || a.order - b.order);
    if (due.length === 0) return;
    this.queue = this.queue.filter((m) => m.at > this.now);
    for (const message of due) {
      const target = this.members.get(message.to);
      if (!target) continue;
      this.stats.delivered++;
      for (const listener of target.message) listener(message.data, message.from);
    }
  }

  /** Disconnects a member: the others are told at once (like the relay's leave notice). */
  disconnect(member: number): void {
    this.members.delete(member);
    this.queue = this.queue.filter((m) => m.from !== member && m.to !== member);
    for (const listeners of this.members.values())
      for (const listener of listeners.leave) listener(member);
  }

  /**
   * One match per member: players `1…players` on members `1…players` (one player each), then
   * spectators.
   */
  matches(options: { players: number; spectators?: number; seed?: string }): OnlineMatch[] {
    const players = Array.from({ length: options.players }, (_, i) => ({
      number: i + 1,
      member: i + 1,
      name: `Player ${i + 1}`,
    }));
    const spectators = Array.from(
      { length: options.spectators ?? 0 },
      (_, i) => options.players + i + 1,
    );
    return [...players.map((p) => p.member), ...spectators].map((member) => ({
      seed: options.seed ?? 'match',
      players,
      spectators,
      self: member,
      local: players.filter((p) => p.member === member).map((p) => p.number),
      late: false,
      transport: this.connect(member),
    }));
  }
}

/**
 * A `Game` without renderer, DOM or audio, enough to run scenes in Node (tests, the harness,
 * dedicated simulations). Objects spawned by class are registered for restores.
 *
 * @example
 * ```ts
 * const scene = await headlessScene(PushPushOnline, 'push-push-online', { match });
 * ```
 */
export function headlessGame(
  options: { width?: number; height?: number; tickRate?: number } = {},
): Game {
  const classes = new Map<string, typeof GameObject>();
  const tickRate = options.tickRate ?? 60;
  const game = {
    config: {
      id: 'headless',
      resolution: {
        width: options.width ?? 1280,
        height: options.height ?? 720,
        mode: 'letterbox',
        pixelArt: false,
      },
      tickRate,
    },
    random: new Random('headless'),
    input: new InputManager({}, undefined, () => []),
    audio: {
      updateListener: () => {},
      play: () => ({
        key: '',
        ended: Promise.resolve(),
        stop() {},
        setVolume() {},
        setPosition() {},
      }),
      music: () => ({
        key: '',
        ended: Promise.resolve(),
        stop() {},
        setVolume() {},
        setPosition() {},
      }),
      stopMusic: () => {},
    },
    sheets: { get: () => undefined },
    textResolution: 1,
    time: { step: 0, now: 0, dt: 1 / tickRate, scale: 1 },
    rememberClass: (type: typeof GameObject) => {
      const name = type.objectName ?? type.name;
      if (!classes.has(name)) classes.set(name, type);
    },
    objectClass: (name: string) => {
      const type = classes.get(name);
      if (!type)
        throw new Error(`Unknown object "${name}": spawn it once by class before restoring.`);
      return type;
    },
  };
  return game as unknown as Game;
}

/** Creates a scene on a {@link headlessGame} and runs its `create(params)`. */
export async function headlessScene<S extends Scene<never>>(
  SceneClass: new () => S,
  name: string,
  params?: unknown,
  game: Game = headlessGame(),
): Promise<S> {
  const scene = new SceneClass();
  scene.init(game, name);
  await scene.start(params);
  return scene;
}

/** What the harness reads from a session (any `RollbackSession`). */
export interface SessionView {
  readonly events: EventBus<RollbackEvents>;
  readonly checksums: ReadonlyMap<number, number>;
  readonly frame: number;
  readonly stats: RollbackStats;
}

/** One running instance in {@link simulateMatch}. */
export interface MatchInstance {
  /** Advances one fixed step of the game loop. */
  tick(): void;
  readonly session: SessionView;
}

/** Options of {@link simulateMatch}. */
export interface SimulateMatchOptions {
  players: number;
  spectators?: number;
  /** Fixed steps to run. */
  frames: number;
  network?: NetworkConditions;
  seed?: string;
  /** Builds one instance from its match (a headless scene with `rollback`, usually). */
  create(match: OnlineMatch): MatchInstance | Promise<MatchInstance>;
  /** Called after every tick with the instances (assertions, scripted leaves). */
  onTick?(frame: number, instances: MatchInstance[], network: SimulatedNetwork): void;
  /** Ticks per second of virtual time. @defaultValue `60` */
  tickRate?: number;
}

/** What {@link simulateMatch} measured. */
export interface MatchResult {
  /** Desyncs reported by any instance. */
  desyncs: (DesyncEvent & { reporter: number })[];
  /** Confirmed checksums of each instance (by member order), `[frame, hash]`. */
  checksums: [number, number][][];
  /** Checksum frames every instance computed with the same hash. */
  agreedFrames: number;
  /** Step reached by each instance. */
  frames: number[];
  stats: RollbackStats[];
  network: SimulatedNetwork['stats'];
}

/**
 * Runs several instances of an online game against a simulated network, faster than real time,
 * and collects checksums and desyncs (NET-05).
 *
 * @example
 * ```ts
 * const result = await simulateMatch({
 *   players: 4, frames: 60 * 60 * 10, network: { latency: 150, jitter: 20, loss: 0.02 },
 *   create: async (match) => {
 *     const scene = await headlessScene(PushPushOnline, 'push-push-online', { match, bot: true });
 *     return { tick: () => scene.step(1 / 60), session: scene.net.session };
 *   },
 * });
 * expect(result.desyncs).toEqual([]);
 * ```
 */
export async function simulateMatch(options: SimulateMatchOptions): Promise<MatchResult> {
  const network = new SimulatedNetwork({ seed: options.seed ?? 'match', ...options.network });
  const matches = network.matches({
    players: options.players,
    spectators: options.spectators,
    seed: options.seed,
  });
  const instances: MatchInstance[] = [];
  for (const match of matches) instances.push(await options.create(match));
  const desyncs: MatchResult['desyncs'] = [];
  instances.forEach((instance, i) =>
    instance.session.events.on('desync', (event) =>
      desyncs.push({ ...event, reporter: matches[i]!.self }),
    ),
  );
  const tickMs = 1000 / (options.tickRate ?? 60);
  for (let frame = 0; frame < options.frames; frame++) {
    network.advance(tickMs);
    for (const instance of instances) instance.tick();
    options.onTick?.(frame, instances, network);
  }
  const checksums = instances.map((instance) => [...instance.session.checksums]);
  const [first, ...others] = instances.map((instance) => instance.session.checksums);
  let agreedFrames = 0;
  for (const [frame, hash] of first ?? [])
    if (others.every((other) => other.get(frame) === hash)) agreedFrames++;
  return {
    desyncs,
    checksums,
    agreedFrames,
    frames: instances.map((instance) => instance.session.frame),
    stats: instances.map((instance) => instance.session.stats),
    network: network.stats,
  };
}
