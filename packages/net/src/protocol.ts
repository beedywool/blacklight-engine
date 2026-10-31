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
  /** Display name sent in `hello`. */
  name: string;
  /** Local players on that machine (couch players joining together). 0 for spectators. */
  players: number;
  /** Watches the match without playing. */
  spectator: boolean;
  /** Ready flag shown in the lobby; the host can start once every player is ready. */
  ready: boolean;
}

/** A room as every member sees it. */
export interface RoomState {
  /** Room code to share with friends ({@link ROOM_CODE_LENGTH} letters of {@link ROOM_CODE_ALPHABET}). */
  code: string;
  /** Game id given in `hello`: only clients of the same game see and join the room. */
  game: string;
  /** Member id of the host: starts the match, gets the room when the host leaves. */
  host: number;
  /** Most players the room accepts, counting every member's local players. */
  maxPlayers: number;
  /** Most spectators the room accepts. */
  maxSpectators: number;
  /** Listed in the lobby (`list`); a private room is joined by code only. */
  public: boolean;
  /** The match has started: new members join as spectators. */
  started: boolean;
  /** Free data set by the host at creation (mode, map, settings). */
  data: { [key: string]: JsonValue };
  /** Members in join order, the host included. */
  members: RoomMember[];
}

/** A public room in the lobby list. */
export interface RoomSummary {
  /** Code to join it with. */
  code: string;
  /** Name of the host. */
  host: string;
  /** Players in the room now. */
  players: number;
  /** Most players the room accepts. */
  maxPlayers: number;
  /** The room's free data (mode, map), to show or filter in a lobby. */
  data: { [key: string]: JsonValue };
}

/** A player slot of a started match. */
export interface MatchPlayerInfo {
  /** Player number in the match, 1–8: `input.player(number)` in the simulation. */
  number: number;
  /** Member that controls it. */
  member: number;
  /** Name of the controlling member, to show on banners. */
  name: string;
}

/** What the server sends when the host starts the match. */
export interface StartInfo {
  /** Seed for the simulation's random generator, the same on every machine. */
  seed: string;
  /** Player slots, ordered by player number. */
  players: MatchPlayerInfo[];
  /** Member ids of the spectators. */
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

/**
 * A control message from a client to the relay, sent as a JSON text frame. `id` is a request id
 * the server echoes as `re` in its answer. `RelayClient` writes these; a custom client or a test
 * server reads them.
 */
export type ClientMessage =
  | {
      /** First message: who connects, for which game and protocol. */
      t: 'hello';
      /** Display name of the member. */
      name: string;
      /** Game id: rooms are per game. */
      game: string;
      /** {@link PROTOCOL_VERSION} of the client. */
      version: number;
    }
  | {
      /** Creates a room and joins it as host. */
      t: 'create';
      /** Request id, echoed as `re`. */
      id: number;
      /** Most players, at most {@link MAX_PLAYERS}. */
      maxPlayers?: number;
      /** Most spectators. */
      maxSpectators?: number;
      /** Listed in the lobby. */
      public?: boolean;
      /** Local players of the host's machine. */
      players?: number;
      /** Free room data (mode, map, settings). */
      data?: { [key: string]: JsonValue };
    }
  | {
      /** Joins a room by code. */
      t: 'join';
      /** Request id, echoed as `re`. */
      id: number;
      /** Room code. */
      code: string;
      /** Join as a spectator. */
      spectator?: boolean;
      /** Local players of this machine. */
      players?: number;
    }
  | {
      /** Asks for the public rooms of the game. */
      t: 'list';
      /** Request id, echoed as `re`. */
      id: number;
    }
  | {
      /** Leaves the current room. */
      t: 'leave';
    }
  | {
      /** Sets the member's ready flag. */
      t: 'ready';
      /** New value of the flag. */
      ready: boolean;
    }
  | {
      /** Starts the match (host only). */
      t: 'start';
      /** Request id, echoed as `re`. */
      id: number;
      /** Fixed seed; the server picks one when absent. */
      seed?: string;
    }
  | {
      /** Measures the round trip. */
      t: 'ping';
      /** Request id, echoed as `re`. */
      id: number;
    };

/**
 * A control message from the relay to a client, sent as a JSON text frame. `re` is the `id` of the
 * request it answers; messages without `re` are pushed by the server (room changes, a member left).
 */
export type ServerMessage =
  | {
      /** Answer to `hello`. */
      t: 'welcome';
      /** Server name and version, for logs. */
      server: string;
      /** {@link PROTOCOL_VERSION} of the server. */
      version: number;
    }
  | {
      /** The room changed (created, joined, a member joined or set ready). */
      t: 'room';
      /** Request id this answers, when it answers one. */
      re?: number;
      /** The room as it is now. */
      room: RoomState;
      /** Member id of the receiver in the room. */
      you: number;
    }
  | {
      /** Answer to `list`. */
      t: 'rooms';
      /** Request id this answers. */
      re: number;
      /** Public rooms of the game. */
      rooms: RoomSummary[];
    }
  | {
      /** The receiver is out of its room (left, or the room closed). */
      t: 'left-room';
    }
  | {
      /** The host started the match. */
      t: 'start';
      /** Request id this answers (for the host). */
      re?: number;
      /** Seed, player slots and spectators. */
      start: StartInfo;
    }
  | {
      /** A member left the room. */
      t: 'left';
      /** Member id of who left. */
      member: number;
    }
  | {
      /** A request failed. */
      t: 'error';
      /** Request id this answers, when it answers one. */
      re?: number;
      /** What went wrong, to branch on. */
      code: RelayErrorCode;
      /** Readable explanation, to log or show. */
      message: string;
    }
  | {
      /** Answer to `ping`. */
      t: 'pong';
      /** Request id this answers. */
      re: number;
    };
