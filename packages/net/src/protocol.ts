// Relay protocol, shared by the client (`RelayClient`) and the server (`@blacklight/relay`).
// Control messages are JSON text frames; game data are binary frames:
//   client → server: [target member, 0 = everyone else][payload]
//   server → client: [sender member][payload]
// This module has no dependency so the server can bundle it.

/** Protocol version; the server refuses clients with another major version. */
export const PROTOCOL_VERSION = 1;

/** Default port of the relay server (also used for LAN hosting). */
export const DEFAULT_RELAY_PORT = 5360;

/** Room code letters: no 0/O, 1/I/L, so codes read aloud and typed on a pad without mistakes. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Length of a room code. */
export const ROOM_CODE_LENGTH = 5;

/** Most players in one room (SPEC: up to 8 players). */
export const MAX_PLAYERS = 8;

/** Largest message the relay forwards, in bytes. */
export const MAX_MESSAGE_BYTES = 64 * 1024;

/** JSON value carried in room data. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** One connection in a room. */
export interface RoomMember {
  /** Id inside the room (1–255), used to address binary messages. */
  id: number;
  name: string;
  /** Local players on that machine (couch players joining together). 0 for spectators. */
  players: number;
  spectator: boolean;
  ready: boolean;
}

/** A room as every member sees it. */
export interface RoomState {
  code: string;
  game: string;
  /** Member id of the host: starts the match, gets the room when the host leaves. */
  host: number;
  maxPlayers: number;
  maxSpectators: number;
  public: boolean;
  started: boolean;
  /** Free data set by the host at creation (mode, map, settings). */
  data: { [key: string]: JsonValue };
  members: RoomMember[];
}

/** A public room in the lobby list. */
export interface RoomSummary {
  code: string;
  host: string;
  players: number;
  maxPlayers: number;
  data: { [key: string]: JsonValue };
}

/** A player slot of a started match. */
export interface MatchPlayerInfo {
  /** Player number in the match, 1–8: `input.player(number)` in the simulation. */
  number: number;
  /** Member that controls it. */
  member: number;
  name: string;
}

/** What the server sends when the host starts the match. */
export interface StartInfo {
  seed: string;
  players: MatchPlayerInfo[];
  spectators: number[];
  /** The member joined after the start (spectator): it must fetch the state from a player. */
  late: boolean;
}

/** Error codes of the relay. */
export type RelayErrorCode =
  | 'bad-request'
  | 'version'
  | 'no-name'
  | 'in-room'
  | 'not-in-room'
  | 'room-not-found'
  | 'room-full'
  | 'started'
  | 'not-host'
  | 'not-ready'
  | 'server-full';

export type ClientMessage =
  | { t: 'hello'; name: string; game: string; version: number }
  | {
      t: 'create';
      id: number;
      maxPlayers?: number;
      maxSpectators?: number;
      public?: boolean;
      players?: number;
      data?: { [key: string]: JsonValue };
    }
  | { t: 'join'; id: number; code: string; spectator?: boolean; players?: number }
  | { t: 'list'; id: number }
  | { t: 'leave' }
  | { t: 'ready'; ready: boolean }
  | { t: 'start'; id: number; seed?: string }
  | { t: 'ping'; id: number };

export type ServerMessage =
  | { t: 'welcome'; server: string; version: number }
  | { t: 'room'; re?: number; room: RoomState; you: number }
  | { t: 'rooms'; re: number; rooms: RoomSummary[] }
  | { t: 'left-room' }
  | { t: 'start'; re?: number; start: StartInfo }
  | { t: 'left'; member: number }
  | { t: 'error'; re?: number; code: RelayErrorCode; message: string }
  | { t: 'pong'; re: number };
