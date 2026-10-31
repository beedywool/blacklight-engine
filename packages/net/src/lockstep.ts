import { EventBus } from '@blacklight/core';
import { ByteReader, ByteWriter } from './bytes';
import { checksum } from './checksum';
import type { OnlineMatch, Unlisten } from './transport';

/** Move data: anything `JSON.stringify` keeps. */
export type Move = string | number | boolean | null | Move[] | { [key: string]: Move };

/** Options of a {@link LockstepSession}. */
export interface LockstepOptions {
  /**
   * `'simultaneous'`: every connected player sends a move each turn (card games, rock-paper-
   * scissors, strategy turns). `'alternate'`: one player per turn, in player order (chess, board
   * games). @defaultValue `'simultaneous'`
   */
  order?: 'simultaneous' | 'alternate';
  /**
   * Text or number describing the game state after each turn; machines compare them to detect a
   * desync. Called right after the `turn` listeners.
   */
  state?: () => string | number;
  /** Ticks between two resends of moves nobody acknowledged yet. @defaultValue `10` */
  resendInterval?: number;
}

/** A completed turn: one move per player (`null` when the player did not play this turn). */
export interface Turn<M extends Move = Move> {
  /** Turn number, from 0. */
  turn: number;
  /** Moves by player: index 0 is player 1. */
  moves: (M | null)[];
}

/** Events of a {@link LockstepSession} (`session.events`). */
export interface LockstepEvents<M extends Move = Move> {
  /** Every required move of a turn arrived; apply them in player order. */
  turn: Turn<M>;
  /** The state after a turn differs from another member's. */
  desync: {
    /** Turn after which the states differ. */
    turn: number;
    /** Member whose state differs from ours. */
    member: number;
    /** State hash computed here. */
    local: number;
    /** State hash the other member sent. */
    remote: number;
  };
  /** A member left; its players are skipped from `turn` on. */
  leave: {
    /** Member that left. */
    member: number;
    /** Its player numbers, skipped from now on. */
    players: number[];
    /** First turn without them. */
    turn: number;
  };
}

const MOVES = 10;

/**
 * Lockstep for turn-based games (NET-04): nothing is predicted; a turn completes when every
 * required move arrived, and every machine applies the same moves in the same order. Moves are
 * resent until every member acknowledged them, so lost messages only delay the turn.
 *
 * @example
 * ```ts
 * const turns = new LockstepSession<{ card: number }>(match, { order: 'simultaneous' });
 * turns.events.on('turn', ({ moves }) => moves.forEach((m, i) => m && this.play(i + 1, m.card)));
 * // when the local player picks a card:
 * turns.submit({ card: 3 });
 * // every frame (or from scene.update):
 * turns.poll();
 * ```
 */
export class LockstepSession<M extends Move = Move> {
  /** Completed turns, desyncs and leaves. */
  readonly events = new EventBus<LockstepEvents<M>>();
  /** Turn waiting for moves (completed turns so far). */
  turn = 0;
  /** Who plays each turn (see {@link LockstepOptions.order}). */
  readonly order: 'simultaneous' | 'alternate';

  private readonly moves = new Map<number, Map<number, string>>();
  private readonly acks = new Map<number, number>();
  private readonly states = new Map<number, number>();
  private readonly remoteStates = new Map<number, Map<number, number>>();
  private readonly reported = new Set<string>();
  private readonly left = new Map<number, number>();
  private readonly lastMove = new Map<number, number>();
  private readonly queue: [Uint8Array, number][] = [];
  private readonly unlisten: Unlisten[] = [];
  private readonly resendInterval: number;
  private ticks = 0;
  private dirty = false;

  constructor(
    /** The match this session plays. */
    readonly match: OnlineMatch,
    private readonly options: LockstepOptions = {},
  ) {
    this.order = options.order ?? 'simultaneous';
    this.resendInterval = options.resendInterval ?? 10;
    for (const member of this.others()) this.acks.set(member, -1);
    this.unlisten.push(
      match.transport.onMessage((data, from) => this.queue.push([data, from])),
      match.transport.onLeave((member) => this.memberLeft(member)),
    );
  }

  private others(): number[] {
    const all = new Set([...this.match.players.map((p) => p.member), ...this.match.spectators]);
    all.delete(this.match.self);
    return [...all];
  }

  private get playerNumbers(): number[] {
    return this.match.players.map((p) => p.number).sort((a, b) => a - b);
  }

  private connected(player: number, turn: number): boolean {
    const left = this.left.get(player);
    return left === undefined || turn < left;
  }

  /** Players whose move turn `turn` needs. */
  required(turn = this.turn): number[] {
    const players = this.playerNumbers;
    if (this.order === 'simultaneous') return players.filter((p) => this.connected(p, turn));
    const active = players.filter((p) => this.connected(p, turn));
    if (active.length === 0) return [];
    return [active[turn % active.length]!];
  }

  /** Players the current turn still waits for. */
  waitingFor(): number[] {
    const got = this.moves.get(this.turn);
    return this.required().filter((p) => !got?.has(p));
  }

  /** `true` when `player` (default: the first local one) must play the current turn. */
  canPlay(player = this.match.local[0]): boolean {
    return player !== undefined && this.waitingFor().includes(player);
  }

  /**
   * Sends the move of a local player for the current turn.
   * @throws Error when it is not this player's turn or the player already played it.
   */
  submit(move: M, player = this.match.local[0]): void {
    if (player === undefined || !this.match.local.includes(player)) {
      throw new Error(
        `Player ${String(player)} is not played on this machine (local players: ${this.match.local.join(', ') || 'none, spectator'}).`,
      );
    }
    if (!this.canPlay(player)) {
      throw new Error(
        `Player ${player} cannot play turn ${this.turn}: ${this.required().includes(player) ? 'its move was already sent' : 'it is not its turn'}. Check canPlay() first.`,
      );
    }
    this.store(this.turn, player, JSON.stringify(move));
    this.dirty = true;
    this.poll();
  }

  private store(turn: number, player: number, json: string): void {
    let map = this.moves.get(turn);
    if (!map) this.moves.set(turn, (map = new Map()));
    if (!map.has(player)) map.set(player, json);
    this.lastMove.set(player, Math.max(this.lastMove.get(player) ?? -1, turn));
  }

  /** Reads the network, completes turns and resends unacknowledged moves. Call it every frame. */
  poll(): void {
    while (this.queue.length > 0) {
      const [data, from] = this.queue.shift()!;
      try {
        this.handle(new ByteReader(data), from);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
      }
    }
    this.complete();
    if (this.dirty || ++this.ticks >= this.resendInterval) this.send();
  }

  private complete(): void {
    for (;;) {
      if (this.required().length === 0 || this.waitingFor().length > 0) return;
      const got = this.moves.get(this.turn);
      const moves = this.playerNumbers.map((p) => {
        const json = got?.get(p);
        return json === undefined ? null : (JSON.parse(json) as M);
      });
      const turn = this.turn;
      this.turn++;
      this.dirty = true;
      this.events.emit('turn', { turn, moves });
      if (this.options.state) {
        const value = this.options.state();
        const hash = typeof value === 'number' ? value >>> 0 : checksum(value);
        this.states.set(turn, hash);
        for (const [member, remote] of this.remoteStates.get(turn) ?? [])
          this.compare(turn, member, remote);
      }
      // Moves stay until every member acknowledged the turn.
      const acked = Math.min(this.turn - 1, ...this.acks.values());
      for (const t of this.moves.keys()) if (t < acked - 1) this.moves.delete(t);
    }
  }

  private compare(turn: number, member: number, remote: number): void {
    const local = this.states.get(turn);
    if (local === undefined || local === remote || this.reported.has(`${turn}:${member}`)) return;
    this.reported.add(`${turn}:${member}`);
    this.events.emit('desync', { turn, member, local, remote });
  }

  private send(): void {
    this.ticks = 0;
    this.dirty = false;
    const w = new ByteWriter().u8(MOVES).i32(this.turn - 1);
    const lastState = this.states.get(this.turn - 1);
    if (lastState === undefined) w.u8(0);
    else
      w.u8(1)
        .i32(this.turn - 1)
        .u32(lastState);
    const oldest = Math.min(this.turn, ...[...this.acks.values()].map((a) => a + 1));
    const out: [number, number, string][] = [];
    for (const [turn, map] of this.moves) {
      if (turn < oldest) continue;
      for (const [player, json] of map)
        if (this.match.local.includes(player)) out.push([turn, player, json]);
    }
    w.u16(out.length);
    for (const [turn, player, json] of out) w.i32(turn).u8(player).text(json);
    this.match.transport.send(w.finish());
  }

  private handle(r: ByteReader, from: number): void {
    if (r.u8() !== MOVES) return;
    this.acks.set(from, Math.max(this.acks.get(from) ?? -1, r.i32()));
    if (r.u8() === 1) {
      const turn = r.i32();
      const hash = r.u32();
      let map = this.remoteStates.get(turn);
      if (!map) this.remoteStates.set(turn, (map = new Map()));
      map.set(from, hash);
      this.compare(turn, from, hash);
    }
    const count = r.u16();
    const owned = new Set(this.match.players.filter((p) => p.member === from).map((p) => p.number));
    for (let i = 0; i < count; i++) {
      const turn = r.i32();
      const player = r.u8();
      const json = r.text();
      if (owned.has(player) && turn >= this.turn) this.store(turn, player, json);
    }
  }

  private memberLeft(member: number): void {
    this.poll();
    this.acks.delete(member);
    const players = this.match.players.filter((p) => p.member === member).map((p) => p.number);
    // Every member received the same moves before the leave notice (ordered relay): the turn
    // after the player's last move is the same everywhere.
    let turn = Infinity;
    for (const p of players) {
      if (!this.left.has(p)) this.left.set(p, (this.lastMove.get(p) ?? -1) + 1);
      turn = Math.min(turn, this.left.get(p)!);
    }
    if (players.length > 0) this.events.emit('leave', { member, players, turn });
    this.complete();
  }

  /** Stops listening to the transport. */
  dispose(): void {
    for (const stop of this.unlisten) stop();
    this.unlisten.length = 0;
  }
}
