import { EventBus } from '@blacklight/core';
import { ByteReader, ByteWriter, sameBytes } from './bytes';
import { checksum, diffStates, type StateDifference } from './checksum';
import type { OnlineMatch, Unlisten } from './transport';

/** What a rollback session drives: save, load and step a deterministic simulation. */
export interface RollbackGame<S> {
  /** Captures the whole simulation state. */
  save(): S;
  /** Returns to a captured state. */
  load(state: S): void;
  /**
   * Runs one step. `inputs[i]` is player `i + 1`'s input for this step, `previous[i]` the one of
   * the step before (for pressed/released).
   */
  step(inputs: readonly Uint8Array[], previous: readonly Uint8Array[], frame: number): void;
  /** Text form of a state: hashed for checksums, compared for desync reports, sent to late spectators. */
  serialize(state: S): string;
  /** Inverse of `serialize` (late spectators). */
  deserialize(text: string): S;
}

/** Tuning of a rollback session. */
export interface RollbackOptions {
  /** Bytes of one player's input for one step. */
  inputSize: number;
  /** Reads the input of a local player for a step (devices, bots). */
  sample(player: number, frame: number): Uint8Array;
  /** Steps between pressing a button and its effect; hides that much latency without rollback. @defaultValue `2` */
  delay?: number;
  /** Most steps predicted ahead of the slowest player; the session waits beyond. @defaultValue `8` */
  maxRollback?: number;
  /** Steps between two checksums. @defaultValue `30` */
  checksumInterval?: number;
}

/** A checksum mismatch: the simulations diverged. */
export interface DesyncEvent {
  /** Step whose starting state differs. */
  frame: number;
  /** Member whose checksum differs from ours. */
  member: number;
  local: number;
  remote: number;
}

/** Details of a desync, once the other member sent its state. */
export interface DesyncReport extends DesyncEvent {
  differences: StateDifference[];
}

export interface RollbackEvents {
  /** Checksums differ: the simulations are no longer the same. Emitted once per member and frame. */
  desync: DesyncEvent;
  /** What differs, after the other member answered with its state. */
  desyncReport: DesyncReport;
  /** A member left; its players get neutral input from `frame` on. */
  leave: { member: number; players: number[]; frame: number };
  /** The session waits for a remote player's input (more than `maxRollback` steps behind). */
  stall: { frame: number; waitingFor: number[] };
  /** A late spectator received the state and starts simulating. */
  synced: { frame: number };
}

/** Counters for a debug overlay and tests. */
export interface RollbackStats {
  /** Times the session went back to an earlier step. */
  rollbacks: number;
  /** Steps simulated again after rollbacks. */
  replayedFrames: number;
  /** Deepest rollback, in steps. */
  deepestRollback: number;
  /** Ticks spent waiting for remote input. */
  stalls: number;
  /** Ticks skipped to let slower machines catch up. */
  waits: number;
  /** Round trip to each member, in steps (averaged). */
  rtt: Map<number, number>;
  messagesSent: number;
  messagesReceived: number;
}

const enum Message {
  Input = 1,
  StateRequest = 2,
  State = 3,
  SyncRequest = 4,
  Sync = 5,
}

/** Frames of input resent in each message at most. */
const RESEND_LIMIT = 120;
/** Checksums repeated in each message (they may be lost). */
const CHECKSUMS_SENT = 4;
/** Serialized states kept for desync reports. */
const STATES_KEPT = 6;

/**
 * Rollback netcode (NET-02): each machine sends only its inputs, predicts the others' (their
 * last input repeats), and when a real input differs from the prediction it loads the state of
 * that step and simulates again up to the present. Checksums of confirmed steps are exchanged
 * to detect desyncs. Spectators simulate confirmed steps only.
 *
 * Most games use {@link rollback}, which runs a session on a scene; this class works with any
 * {@link RollbackGame}.
 *
 * @example
 * ```ts
 * const session = new RollbackSession(match, game, { inputSize: 1, sample: () => readPad() });
 * // every fixed step:
 * session.tick();
 * ```
 */
export class RollbackSession<S> {
  readonly events = new EventBus<RollbackEvents>();
  readonly stats: RollbackStats = {
    rollbacks: 0,
    replayedFrames: 0,
    deepestRollback: 0,
    stalls: 0,
    waits: 0,
    rtt: new Map(),
    messagesSent: 0,
    messagesReceived: 0,
  };
  /** Next step to simulate (steps simulated so far). */
  frame = 0;
  /** `true` while steps are simulated again after a rollback (skip sounds and effects). */
  replaying = false;
  /** Confirmed checksums by frame, oldest first (tests compare them across machines). */
  readonly checksums = new Map<number, number>();
  /** Steps of input delay; can change during the match. */
  delay: number;
  readonly maxRollback: number;
  readonly checksumInterval: number;
  /** `true` for spectators (no local player). */
  readonly spectator: boolean;

  private readonly count: number;
  private readonly local: Set<number>;
  private readonly memberOf: number[];
  private readonly inputs: Map<number, Uint8Array>[];
  private readonly used: Map<number, Uint8Array>[];
  private readonly confirmed: number[];
  private readonly leftAt: (number | undefined)[];
  private readonly zero: Uint8Array;
  private readonly states = new Map<number, S>();
  private readonly serialized = new Map<number, string>();
  private readonly recent: [frame: number, hash: number][] = [];
  private readonly remoteChecksums = new Map<number, Map<number, number>>();
  private readonly reported = new Set<string>();
  private readonly acks = new Map<number, number[]>();
  private readonly remoteFrame = new Map<number, number>();
  private readonly remoteLag = new Map<number, number>();
  private readonly queue: [Uint8Array, number][] = [];
  private readonly unlisten: Unlisten[] = [];
  private rollbackTo = Infinity;
  private lastSampled: number;
  private nextChecksum: number;
  private advantage = 0;
  private sinceWait = 0;
  private synced: boolean;
  private syncTimer = 0;

  constructor(
    readonly match: OnlineMatch,
    private readonly game: RollbackGame<S>,
    private readonly options: RollbackOptions,
  ) {
    const numbers = match.players.map((p) => p.number).sort((a, b) => a - b);
    if (numbers.length === 0 || numbers.length > 8 || numbers.some((n, i) => n !== i + 1)) {
      throw new Error(
        `A match needs players numbered 1 to N (N ≤ 8); got [${numbers.join(', ')}]. Use the match from RelayClient.match() or the test harness.`,
      );
    }
    this.count = numbers.length;
    this.delay = options.delay ?? 2;
    this.maxRollback = options.maxRollback ?? 8;
    this.checksumInterval = options.checksumInterval ?? 30;
    if (this.delay < 0 || this.maxRollback < 1 || this.checksumInterval < 1) {
      throw new RangeError('delay must be ≥ 0, maxRollback and checksumInterval ≥ 1.');
    }
    this.local = new Set(match.local);
    this.spectator = this.local.size === 0;
    this.memberOf = numbers.map((n) => match.players.find((p) => p.number === n)!.member);
    this.inputs = numbers.map(() => new Map());
    this.used = numbers.map(() => new Map());
    // Steps before the first delay have neutral input for everyone, known in advance.
    this.confirmed = numbers.map(() => this.delay - 1);
    this.leftAt = numbers.map(() => undefined);
    this.zero = new Uint8Array(options.inputSize);
    this.lastSampled = this.delay - 1;
    this.nextChecksum = this.checksumInterval;
    this.synced = !match.late;
    for (const member of this.otherMembers())
      this.acks.set(
        member,
        numbers.map(() => this.delay - 1),
      );
    this.unlisten.push(
      match.transport.onMessage((data, from) => this.queue.push([data, from])),
      match.transport.onLeave((member) => this.memberLeft(member)),
    );
  }

  private otherMembers(): number[] {
    const all = new Set([...this.memberOf, ...this.match.spectators]);
    all.delete(this.match.self);
    return [...all];
  }

  /** Lowest confirmed step over every player (left players count as confirmed forever). */
  private get minConfirmed(): number {
    let min = Infinity;
    for (let i = 0; i < this.count; i++)
      if (this.leftAt[i] === undefined) min = Math.min(min, this.confirmed[i]!);
    return min;
  }

  /** Input of player index `i` for `frame` if known for sure. */
  private known(i: number, frame: number): Uint8Array | undefined {
    if (frame < this.delay || frame < 0) return this.zero;
    const left = this.leftAt[i];
    if (left !== undefined && frame >= left) return this.zero;
    if (frame <= this.confirmed[i]!) return this.inputs[i]!.get(frame) ?? this.zero;
    return undefined;
  }

  /** Input used for a step: the real one, or the prediction (last confirmed input repeats). */
  private inputFor(i: number, frame: number): Uint8Array {
    const real = this.known(i, frame);
    if (real) {
      this.used[i]!.delete(frame);
      return real;
    }
    const prediction = this.known(i, this.confirmed[i]!) ?? this.zero;
    this.used[i]!.set(frame, prediction);
    return prediction;
  }

  private inputAt(i: number, frame: number): Uint8Array {
    return this.known(i, frame) ?? this.used[i]!.get(frame) ?? this.zero;
  }

  private simulate(frame: number): void {
    const inputs: Uint8Array[] = [];
    const previous: Uint8Array[] = [];
    for (let i = 0; i < this.count; i++) {
      previous.push(this.inputAt(i, frame - 1));
      inputs.push(this.inputFor(i, frame));
    }
    this.game.step(inputs, previous, frame);
  }

  /**
   * Advances the session by one tick of the game loop: reads the network, rolls back when a
   * prediction was wrong, simulates the next step (or waits) and sends this machine's inputs.
   * Returns the number of new steps simulated (0 while waiting).
   */
  tick(): number {
    this.receive();
    const advanced = this.spectator ? this.tickSpectator() : this.tickPlayer();
    this.computeChecksums();
    this.send();
    this.prune();
    return advanced;
  }

  private tickPlayer(): number {
    if (this.rollbackTo < this.frame) this.replay(this.rollbackTo);
    this.rollbackTo = Infinity;

    const waitingFor: number[] = [];
    for (let i = 0; i < this.count; i++) {
      if (this.local.has(i + 1) || this.leftAt[i] !== undefined) continue;
      if (this.frame - this.confirmed[i]! > this.maxRollback) waitingFor.push(i + 1);
    }
    if (waitingFor.length > 0) {
      this.stats.stalls++;
      this.events.emit('stall', { frame: this.frame, waitingFor });
      return 0;
    }
    if (this.shouldWait()) {
      this.stats.waits++;
      return 0;
    }

    const target = this.frame + this.delay;
    if (this.lastSampled < target) {
      for (const player of this.match.local) {
        const input = this.options.sample(player, target);
        if (input.length !== this.options.inputSize) {
          throw new Error(
            `The input of player ${player} has ${input.length} bytes; the session expects ${this.options.inputSize} (inputSize).`,
          );
        }
        // A larger delay leaves a gap: the new input fills it.
        for (let f = this.lastSampled + 1; f <= target; f++) this.inputs[player - 1]!.set(f, input);
        this.confirmed[player - 1] = target;
      }
      this.lastSampled = target;
    }

    this.states.set(this.frame, this.game.save());
    this.simulate(this.frame);
    this.frame++;
    return 1;
  }

  private tickSpectator(): number {
    if (!this.synced) {
      if (this.syncTimer-- <= 0) {
        this.syncTimer = 30;
        const host = this.memberOf.find((_, i) => this.leftAt[i] === undefined);
        if (host !== undefined) this.post(new ByteWriter().u8(Message.SyncRequest).finish(), host);
      }
      return 0;
    }
    const behind = this.minConfirmed - this.frame;
    const budget = behind > 10 ? 4 : 1;
    let advanced = 0;
    while (advanced < budget && this.frame <= this.minConfirmed) {
      this.states.set(this.frame, this.game.save());
      this.simulate(this.frame);
      this.frame++;
      advanced++;
    }
    return advanced;
  }

  /** Loads the state before `from` and simulates again up to the present. */
  private replay(from: number): void {
    const state = this.states.get(from);
    if (state === undefined) {
      throw new Error(
        `Rollback to step ${from} is impossible: its state is gone (now at ${this.frame}). This is a bug in @blacklight/net.`,
      );
    }
    const depth = this.frame - from;
    this.stats.rollbacks++;
    this.stats.replayedFrames += depth;
    this.stats.deepestRollback = Math.max(this.stats.deepestRollback, depth);
    this.game.load(state);
    this.replaying = true;
    try {
      for (let f = from; f < this.frame; f++) {
        if (f !== from) this.states.set(f, this.game.save());
        this.simulate(f);
      }
    } finally {
      this.replaying = false;
    }
  }

  /** Time sync: wait one tick now and then when this machine runs ahead of the others. */
  private shouldWait(): boolean {
    let ahead = -Infinity;
    for (let i = 0; i < this.count; i++) {
      const member = this.memberOf[i]!;
      if (this.local.has(i + 1) || this.leftAt[i] !== undefined) continue;
      const theirs = this.remoteFrame.get(member);
      const lag = this.remoteLag.get(member);
      if (theirs === undefined || lag === undefined) continue;
      // (our lead as we see it − their lead as they see it) / 2 cancels the latency out.
      ahead = Math.max(ahead, (this.frame - theirs - lag) / 2);
    }
    if (ahead === -Infinity) return false;
    this.advantage = this.advantage * 0.9 + ahead * 0.1;
    this.sinceWait++;
    if (this.advantage >= 1.5 && this.sinceWait >= 8) {
      this.sinceWait = 0;
      this.advantage -= 1;
      return true;
    }
    return false;
  }

  private computeChecksums(): void {
    while (this.nextChecksum < this.frame && this.nextChecksum - 1 <= this.minConfirmed) {
      const frame = this.nextChecksum;
      this.nextChecksum += this.checksumInterval;
      const state = this.states.get(frame);
      if (state === undefined) continue;
      const text = this.game.serialize(state);
      const hash = checksum(text);
      this.checksums.set(frame, hash);
      this.recent.push([frame, hash]);
      if (this.recent.length > CHECKSUMS_SENT) this.recent.shift();
      this.serialized.set(frame, text);
      for (const key of [...this.serialized.keys()])
        if (this.serialized.size > STATES_KEPT) this.serialized.delete(key);
      const remote = this.remoteChecksums.get(frame);
      if (remote) for (const [member, value] of remote) this.compare(frame, member, value);
    }
  }

  private compare(frame: number, member: number, remote: number): void {
    const local = this.checksums.get(frame);
    if (local === undefined || local === remote) return;
    const key = `${frame}:${member}`;
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.events.emit('desync', { frame, member, local, remote });
    this.post(new ByteWriter().u8(Message.StateRequest).i32(frame).finish(), member);
  }

  private send(): void {
    // A late spectator stays silent until it has the state, or players would resend from step 0.
    if (!this.synced) return;
    const w = new ByteWriter().u8(Message.Input).i32(this.frame);
    w.u8(this.count);
    for (let i = 0; i < this.count; i++)
      w.i32(this.leftAt[i] !== undefined ? 0x7fffffff : this.confirmed[i]!);
    const seen = [...this.remoteFrame];
    w.u8(seen.length);
    for (const [member, frame] of seen) w.u8(member).i32(frame);
    w.u8(this.recent.length);
    for (const [frame, hash] of this.recent) w.i32(frame).u32(hash);
    const blocks: [number, number, number][] = [];
    for (const player of this.match.local) {
      const i = player - 1;
      let from = this.confirmed[i]! + 1;
      for (const acks of this.acks.values()) from = Math.min(from, acks[i]! + 1);
      from = Math.max(from, this.delay, this.confirmed[i]! - RESEND_LIMIT + 1);
      const count = this.confirmed[i]! - from + 1;
      if (count > 0) blocks.push([player, from, count]);
    }
    w.u8(blocks.length);
    for (const [player, from, count] of blocks) {
      w.u8(player).i32(from).u16(count);
      for (let f = from; f < from + count; f++)
        w.bytes(this.inputs[player - 1]!.get(f) ?? this.zero);
    }
    this.post(w.finish());
  }

  private post(data: Uint8Array, to?: number): void {
    this.stats.messagesSent++;
    this.match.transport.send(data, to);
  }

  private receive(): void {
    while (this.queue.length > 0) {
      const [data, from] = this.queue.shift()!;
      this.stats.messagesReceived++;
      try {
        this.handle(new ByteReader(data), from);
      } catch (error) {
        // A malformed message is dropped; the next ones carry the same data again.
        if (!(error instanceof RangeError)) throw error;
      }
    }
  }

  private handle(r: ByteReader, from: number): void {
    switch (r.u8()) {
      case Message.Input:
        return this.handleInput(r, from);
      case Message.StateRequest: {
        const frame = r.i32();
        const text = this.serialized.get(frame);
        if (text !== undefined)
          this.post(new ByteWriter().u8(Message.State).i32(frame).text(text).finish(), from);
        return;
      }
      case Message.State: {
        const frame = r.i32();
        const remote = r.text();
        const local = this.serialized.get(frame);
        if (local === undefined) return;
        const event = {
          frame,
          member: from,
          local: this.checksums.get(frame) ?? 0,
          remote: checksum(remote),
        };
        this.events.emit('desyncReport', {
          ...event,
          differences: diffStates(JSON.parse(local), JSON.parse(remote)),
        });
        return;
      }
      case Message.SyncRequest:
        return this.answerSync(from);
      case Message.Sync:
        return this.handleSync(r);
    }
  }

  private handleInput(r: ByteReader, from: number): void {
    const frame = r.i32();
    const count = r.u8();
    const acks: number[] = [];
    for (let i = 0; i < count; i++) acks.push(r.i32());
    if (count === this.count) this.acks.set(from, acks);
    const seen = r.u8();
    for (let i = 0; i < seen; i++) {
      const member = r.u8();
      const theirView = r.i32();
      if (member === this.match.self) {
        this.remoteLag.set(from, frame - theirView);
        const rtt = this.frame - theirView;
        const average = this.stats.rtt.get(from);
        this.stats.rtt.set(from, average === undefined ? rtt : average * 0.9 + rtt * 0.1);
      }
    }
    this.remoteFrame.set(from, Math.max(this.remoteFrame.get(from) ?? frame, frame));
    const checksums = r.u8();
    for (let i = 0; i < checksums; i++) {
      const at = r.i32();
      const hash = r.u32();
      let map = this.remoteChecksums.get(at);
      if (!map) this.remoteChecksums.set(at, (map = new Map()));
      map.set(from, hash);
      this.compare(at, from, hash);
    }
    const blocks = r.u8();
    for (let b = 0; b < blocks; b++) {
      const player = r.u8();
      const start = r.i32();
      const length = r.u16();
      const i = player - 1;
      const valid =
        i >= 0 && i < this.count && this.memberOf[i] === from && !this.local.has(player);
      for (let f = start; f < start + length; f++) {
        const input = r.bytes(this.options.inputSize);
        if (valid && f > this.confirmed[i]! && this.leftAt[i] === undefined)
          this.inputs[i]!.set(f, input);
      }
      if (valid) this.advanceConfirmed(i);
    }
  }

  /** Moves a player's confirmed step over contiguous received inputs; marks wrong predictions. */
  private advanceConfirmed(i: number): void {
    while (this.inputs[i]!.has(this.confirmed[i]! + 1)) {
      const frame = ++this.confirmed[i]!;
      const predicted = this.used[i]!.get(frame);
      if (predicted && !sameBytes(predicted, this.inputs[i]!.get(frame)!))
        this.rollbackTo = Math.min(this.rollbackTo, frame);
      this.used[i]!.delete(frame);
    }
  }

  private memberLeft(member: number): void {
    this.acks.delete(member);
    this.remoteFrame.delete(member);
    this.remoteLag.delete(member);
    const players: number[] = [];
    let at = Infinity;
    // Every member received the same inputs before the leave notice (ordered relay), so they
    // agree on the step from which this player's input is neutral.
    this.receive();
    for (let i = 0; i < this.count; i++) {
      if (this.memberOf[i] !== member || this.leftAt[i] !== undefined) continue;
      const left = this.confirmed[i]! + 1;
      this.leftAt[i] = left;
      at = Math.min(at, left);
      players.push(i + 1);
      for (let f = left; f < this.frame; f++) {
        const predicted = this.used[i]!.get(f);
        if (predicted && !sameBytes(predicted, this.zero)) {
          this.rollbackTo = Math.min(this.rollbackTo, f);
          break;
        }
      }
    }
    if (players.length > 0) this.events.emit('leave', { member, players, frame: at });
  }

  /** `false` once the player's machine left (its input is neutral from then on). */
  connected(player: number, frame = this.frame): boolean {
    const left = this.leftAt[player - 1];
    return left === undefined || frame < left;
  }

  /** A late spectator asks for the state: the first connected player answers. */
  private answerSync(from: number): void {
    if (this.spectator) return;
    const first = this.memberOf.findIndex((_, i) => this.leftAt[i] === undefined);
    if (this.memberOf[first] !== this.match.self) return;
    const frame = Math.min(this.minConfirmed + 1, this.frame - 1);
    const state = this.states.get(frame);
    if (state === undefined) return;
    const w = new ByteWriter().u8(Message.Sync).i32(frame).u8(this.count);
    for (let i = 0; i < this.count; i++) {
      const left = this.leftAt[i];
      const last = left !== undefined ? left - 1 : this.confirmed[i]!;
      w.i32(left ?? -1).i32(last);
      for (let f = frame - 1; f <= last; f++) w.bytes(this.inputAt(i, f));
    }
    w.text(this.game.serialize(state));
    this.post(w.finish(), from);
  }

  private handleSync(r: ByteReader): void {
    if (this.synced) return;
    const frame = r.i32();
    const count = r.u8();
    if (count !== this.count) return;
    for (let i = 0; i < count; i++) {
      const left = r.i32();
      const last = r.i32();
      if (left >= 0) this.leftAt[i] = left;
      for (let f = frame - 1; f <= last; f++)
        this.inputs[i]!.set(f, r.bytes(this.options.inputSize));
      this.confirmed[i] = last;
    }
    for (let i = 0; i < count; i++) this.advanceConfirmed(i);
    this.game.load(this.game.deserialize(r.text()));
    this.frame = frame;
    this.nextChecksum = Math.ceil((frame + 1) / this.checksumInterval) * this.checksumInterval;
    this.synced = true;
    this.events.emit('synced', { frame });
  }

  /** Forgets inputs and states nobody can need any more. */
  private prune(): void {
    const keepStates = this.frame - this.maxRollback - 2;
    for (const frame of this.states.keys()) if (frame < keepStates) this.states.delete(frame);
    for (let i = 0; i < this.count; i++) {
      let oldest = Math.min(this.confirmed[i]!, keepStates) - 2;
      if (this.local.has(i + 1))
        for (const acks of this.acks.values()) oldest = Math.min(oldest, acks[i]!);
      oldest = Math.max(oldest, this.confirmed[i]! - RESEND_LIMIT - 2);
      const inputs = this.inputs[i]!;
      if (inputs.size > RESEND_LIMIT * 2)
        for (const frame of inputs.keys()) if (frame < oldest) inputs.delete(frame);
    }
    for (const frame of this.remoteChecksums.keys())
      if (frame < this.frame - this.checksumInterval * 8) this.remoteChecksums.delete(frame);
  }

  /** Stops listening to the transport. */
  dispose(): void {
    for (const stop of this.unlisten) stop();
    this.unlisten.length = 0;
  }
}
