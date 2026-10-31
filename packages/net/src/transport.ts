import type { MatchPlayerInfo } from './protocol';

/** Stops a listener. */
export type Unlisten = () => void;

/**
 * How the members of a match exchange bytes: the relay's WebSocket (`RelayClient`) or the
 * simulated network of the test harness. Sessions assume nothing about delivery: messages may be
 * late, reordered, duplicated or lost.
 */
export interface Transport {
  /** Sends to one member, or to every other member when `to` is omitted. */
  send(data: Uint8Array, to?: number): void;
  /** Calls `listener` with every message from another member and the sender's member id. */
  onMessage(listener: (data: Uint8Array, from: number) => void): Unlisten;
  /** A member left the match (closed the game, lost the connection). */
  onLeave(listener: (member: number) => void): Unlisten;
}

/**
 * A started match, as the relay or the test harness hands it to a session.
 *
 * @example
 * ```ts
 * const match = await relay.match(); // resolves when the host starts
 * this.goto('push-push-online', { match });
 * ```
 */
export interface OnlineMatch {
  /** Shared random seed: every member seeds the simulation with it. */
  seed: string;
  /** Player slots, numbered from 1. */
  players: MatchPlayerInfo[];
  /** Spectator member ids. */
  spectators: number[];
  /** This machine's member id. */
  self: number;
  /** Player numbers controlled here, in local player order (empty for a spectator). */
  local: number[];
  /** Joined after the start: the session fetches the state from a player first. */
  late: boolean;
  /** Channel to the other members, used by the session. */
  transport: Transport;
}
