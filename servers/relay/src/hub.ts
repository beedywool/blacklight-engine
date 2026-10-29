import { randomBytes, randomInt } from 'node:crypto';
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type ClientMessage,
  type JsonValue,
  type MatchPlayerInfo,
  type RelayErrorCode,
  type RoomState,
  type ServerMessage,
  type StartInfo,
} from '@blacklight/net/protocol';

/** One client connection, whatever carries it (WebSocket, or a fake in tests). */
export interface Connection {
  send(data: string | Uint8Array): void;
  close(code: number, reason: string): void;
}

/** Limits of a {@link RelayHub}. */
export interface HubOptions {
  /** Rooms open at once. @defaultValue `1000` */
  maxRooms?: number;
  /** Connections at once. @defaultValue `5000` */
  maxPeers?: number;
  /** Most spectators a room may allow. @defaultValue `32` */
  spectatorLimit?: number;
  /** Log lines (room created, started, closed). @defaultValue none */
  log?: (line: string) => void;
}

interface Peer {
  connection: Connection;
  name: string;
  game: string;
  room: Room | undefined;
  member: number;
  players: number;
  spectator: boolean;
  ready: boolean;
}

interface Room {
  code: string;
  game: string;
  host: Peer;
  maxPlayers: number;
  maxSpectators: number;
  public: boolean;
  data: { [key: string]: JsonValue };
  members: Map<number, Peer>;
  nextMember: number;
  start: Omit<StartInfo, 'late'> | undefined;
}

/** Handle of a connected client, returned by {@link RelayHub.connect}. */
export interface PeerHandle {
  /** A text (JSON) or binary frame arrived from the client. */
  receive(data: string | Uint8Array): void;
  /** The connection closed. */
  close(): void;
}

const NAME_LIMIT = 32;
const GAME_LIMIT = 64;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rooms, codes, lobby and message routing of the relay, independent of the network layer.
 * The relay never looks inside game messages: it forwards binary frames between members.
 *
 * @example
 * ```ts
 * const hub = new RelayHub();
 * const peer = hub.connect({ send: (d) => socket.send(d), close: (c, r) => socket.close(c, r) });
 * socket.on('message', (data, binary) => peer.receive(binary ? data : String(data)));
 * socket.on('close', () => peer.close());
 * ```
 */
export class RelayHub {
  readonly rooms = new Map<string, Room>();
  private readonly peers = new Set<Peer>();
  private readonly options: Required<HubOptions>;

  constructor(options: HubOptions = {}) {
    this.options = {
      maxRooms: options.maxRooms ?? 1000,
      maxPeers: options.maxPeers ?? 5000,
      spectatorLimit: options.spectatorLimit ?? 32,
      log: options.log ?? (() => {}),
    };
  }

  /** Counts for the health endpoint and the desktop app. */
  stats(): { peers: number; rooms: number; started: number } {
    let started = 0;
    for (const room of this.rooms.values()) if (room.start) started++;
    return { peers: this.peers.size, rooms: this.rooms.size, started };
  }

  /** Registers a new client. */
  connect(connection: Connection): PeerHandle {
    const peer: Peer = {
      connection,
      name: '',
      game: '',
      room: undefined,
      member: 0,
      players: 0,
      spectator: false,
      ready: false,
    };
    if (this.peers.size >= this.options.maxPeers) {
      this.send(peer, {
        t: 'error',
        code: 'server-full',
        message: 'The relay is full; try again later.',
      });
      connection.close(1013, 'server full');
      return { receive: () => {}, close: () => {} };
    }
    this.peers.add(peer);
    return {
      receive: (data) => {
        if (typeof data === 'string') this.text(peer, data);
        else this.binary(peer, data);
      },
      close: () => {
        this.leaveRoom(peer, false);
        this.peers.delete(peer);
      },
    };
  }

  private send(peer: Peer, message: ServerMessage): void {
    peer.connection.send(JSON.stringify(message));
  }

  private error(peer: Peer, code: RelayErrorCode, message: string, re?: number): void {
    this.send(
      peer,
      re === undefined ? { t: 'error', code, message } : { t: 'error', re, code, message },
    );
  }

  private text(peer: Peer, raw: string): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return this.error(peer, 'bad-request', 'Messages must be JSON.');
    }
    if (!isRecord(message) || typeof message.t !== 'string')
      return this.error(peer, 'bad-request', 'A message needs a string field "t".');
    const re = 'id' in message && typeof message.id === 'number' ? message.id : undefined;
    if (message.t !== 'hello' && !peer.name)
      return this.error(peer, 'no-name', 'Send "hello" with a name and a game first.', re);
    switch (message.t) {
      case 'hello':
        return this.hello(peer, message);
      case 'create':
        return this.create(peer, message, re);
      case 'join':
        return this.join(peer, message, re);
      case 'list':
        return this.send(peer, { t: 'rooms', re: re ?? 0, rooms: this.list(peer.game) });
      case 'leave':
        if (!peer.room) return this.error(peer, 'not-in-room', 'You are not in a room.');
        return this.leaveRoom(peer, true);
      case 'ready':
        if (!peer.room) return this.error(peer, 'not-in-room', 'You are not in a room.');
        peer.ready = message.ready === true;
        return this.broadcastRoom(peer.room);
      case 'start':
        return this.start(peer, message, re);
      case 'ping':
        return this.send(peer, { t: 'pong', re: re ?? 0 });
      default:
        return this.error(
          peer,
          'bad-request',
          `Unknown message type "${String((message as { t: unknown }).t)}".`,
          re,
        );
    }
  }

  private hello(peer: Peer, message: Extract<ClientMessage, { t: 'hello' }>): void {
    if (message.version !== PROTOCOL_VERSION) {
      return this.error(
        peer,
        'version',
        `This relay speaks protocol ${PROTOCOL_VERSION}, the game ${String(message.version)}. Update the relay or the game so both use the same @blacklight/net version.`,
      );
    }
    const name = typeof message.name === 'string' ? message.name.trim() : '';
    const game = typeof message.game === 'string' ? message.game.trim() : '';
    if (!name || name.length > NAME_LIMIT)
      return this.error(
        peer,
        'bad-request',
        `The player name must have 1 to ${NAME_LIMIT} characters.`,
      );
    if (!game || game.length > GAME_LIMIT)
      return this.error(
        peer,
        'bad-request',
        `The game id must have 1 to ${GAME_LIMIT} characters (use game.config.id).`,
      );
    peer.name = name;
    peer.game = game;
    this.send(peer, { t: 'welcome', server: 'blacklight-relay', version: PROTOCOL_VERSION });
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++)
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private create(peer: Peer, message: Extract<ClientMessage, { t: 'create' }>, re?: number): void {
    if (peer.room)
      return this.error(peer, 'in-room', 'Leave your room before creating another one.', re);
    if (this.rooms.size >= this.options.maxRooms)
      return this.error(peer, 'server-full', 'The relay has no free room; try again later.', re);
    const maxPlayers = clampInt(message.maxPlayers, 1, MAX_PLAYERS, MAX_PLAYERS);
    const room: Room = {
      code: this.newCode(),
      game: peer.game,
      host: peer,
      maxPlayers,
      maxSpectators: clampInt(message.maxSpectators, 0, this.options.spectatorLimit, 8),
      public: message.public === true,
      data: isRecord(message.data) ? (message.data as Room['data']) : {},
      members: new Map(),
      nextMember: 1,
      start: undefined,
    };
    this.rooms.set(room.code, room);
    this.enter(peer, room, false, clampInt(message.players, 1, maxPlayers, 1));
    this.options.log(`room ${room.code} created by "${peer.name}" (${peer.game})`);
    this.broadcastRoom(room, peer, re);
  }

  private join(peer: Peer, message: Extract<ClientMessage, { t: 'join' }>, re?: number): void {
    if (peer.room)
      return this.error(peer, 'in-room', 'Leave your room before joining another one.', re);
    const code = typeof message.code === 'string' ? message.code.trim().toUpperCase() : '';
    const room = this.rooms.get(code);
    if (!room || room.game !== peer.game)
      return this.error(
        peer,
        'room-not-found',
        `No room "${code}". Check the code with the host.`,
        re,
      );
    const spectator = message.spectator === true;
    const members = [...room.members.values()];
    if (spectator) {
      if (members.filter((m) => m.spectator).length >= room.maxSpectators)
        return this.error(peer, 'room-full', `Room ${code} has no spectator place left.`, re);
    } else {
      if (room.start)
        return this.error(
          peer,
          'started',
          `Room ${code} already started; join as a spectator.`,
          re,
        );
      const players = clampInt(message.players, 1, MAX_PLAYERS, 1);
      const taken = members.reduce((n, m) => n + m.players, 0);
      if (taken + players > room.maxPlayers)
        return this.error(
          peer,
          'room-full',
          `Room ${code} is full (${taken}/${room.maxPlayers} players).`,
          re,
        );
    }
    if (room.nextMember > 255) return this.error(peer, 'room-full', `Room ${code} is full.`, re);
    this.enter(peer, room, spectator, spectator ? 0 : clampInt(message.players, 1, MAX_PLAYERS, 1));
    this.broadcastRoom(room, peer, re);
    if (room.start) this.send(peer, { t: 'start', start: { ...room.start, late: true } });
  }

  private enter(peer: Peer, room: Room, spectator: boolean, players: number): void {
    peer.room = room;
    peer.member = room.nextMember++;
    peer.spectator = spectator;
    peer.players = players;
    peer.ready = false;
    room.members.set(peer.member, peer);
  }

  private list(game: string): ReturnType<RelayHub['summary']>[] {
    return [...this.rooms.values()]
      .filter((r) => r.public && !r.start && r.game === game)
      .map((r) => this.summary(r));
  }

  private summary(room: Room) {
    return {
      code: room.code,
      host: room.host.name,
      players: [...room.members.values()].reduce((n, m) => n + m.players, 0),
      maxPlayers: room.maxPlayers,
      data: room.data,
    };
  }

  private state(room: Room): RoomState {
    return {
      code: room.code,
      game: room.game,
      host: room.host.member,
      maxPlayers: room.maxPlayers,
      maxSpectators: room.maxSpectators,
      public: room.public,
      started: room.start !== undefined,
      data: room.data,
      members: [...room.members.values()].map((m) => ({
        id: m.member,
        name: m.name,
        players: m.players,
        spectator: m.spectator,
        ready: m.ready,
      })),
    };
  }

  /** Sends the room to every member; `asker` gets it as the answer to request `re`. */
  private broadcastRoom(room: Room, asker?: Peer, re?: number): void {
    const state = this.state(room);
    for (const member of room.members.values()) {
      const message: ServerMessage =
        member === asker && re !== undefined
          ? { t: 'room', re, room: state, you: member.member }
          : { t: 'room', room: state, you: member.member };
      this.send(member, message);
    }
  }

  private start(peer: Peer, message: Extract<ClientMessage, { t: 'start' }>, re?: number): void {
    const room = peer.room;
    if (!room) return this.error(peer, 'not-in-room', 'You are not in a room.', re);
    if (room.host !== peer)
      return this.error(peer, 'not-host', 'Only the host starts the match.', re);
    if (room.start) return this.error(peer, 'started', 'The match already started.', re);
    const waiting = [...room.members.values()].filter(
      (m) => m !== peer && !m.spectator && !m.ready,
    );
    if (waiting.length > 0) {
      return this.error(
        peer,
        'not-ready',
        `Waiting for ${waiting.map((m) => m.name).join(', ')} to be ready.`,
        re,
      );
    }
    const players: MatchPlayerInfo[] = [];
    for (const member of room.members.values()) {
      if (member.spectator) continue;
      for (let i = 0; i < member.players; i++) {
        players.push({
          number: players.length + 1,
          member: member.member,
          name: member.players > 1 ? `${member.name} ${i + 1}` : member.name,
        });
      }
    }
    room.start = {
      seed:
        typeof message.seed === 'string' && message.seed
          ? message.seed.slice(0, 64)
          : randomBytes(8).toString('hex'),
      players,
      spectators: [...room.members.values()].filter((m) => m.spectator).map((m) => m.member),
    };
    this.options.log(`room ${room.code} started with ${players.length} players`);
    for (const member of room.members.values()) {
      const start = { ...room.start, late: false };
      this.send(
        member,
        member === peer && re !== undefined ? { t: 'start', re, start } : { t: 'start', start },
      );
    }
    this.broadcastRoom(room);
  }

  private binary(peer: Peer, data: Uint8Array): void {
    const room = peer.room;
    if (!room || data.length < 1) return;
    const target = data[0]!;
    const frame = new Uint8Array(data.length);
    frame.set(data);
    frame[0] = peer.member;
    if (target === 0) {
      for (const member of room.members.values())
        if (member !== peer) member.connection.send(frame);
    } else {
      room.members.get(target)?.connection.send(frame);
    }
  }

  private leaveRoom(peer: Peer, notify: boolean): void {
    const room = peer.room;
    if (!room) return;
    room.members.delete(peer.member);
    peer.room = undefined;
    if (notify) this.send(peer, { t: 'left-room' });
    if (room.members.size === 0) {
      this.rooms.delete(room.code);
      this.options.log(`room ${room.code} closed`);
      return;
    }
    if (room.host === peer) {
      const members = [...room.members.values()];
      room.host = members.find((m) => !m.spectator) ?? members[0]!;
    }
    if (room.start)
      for (const member of room.members.values())
        this.send(member, { t: 'left', member: peer.member });
    this.broadcastRoom(room);
  }
}
