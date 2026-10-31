import { EventBus } from '@blacklight/core';
import {
  DEFAULT_RELAY_PORT,
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  type ClientMessage,
  type JsonValue,
  type RelayErrorCode,
  type RoomState,
  type RoomSummary,
  type ServerMessage,
  type StartInfo,
} from './protocol';
import type { OnlineMatch, Transport, Unlisten } from './transport';

/**
 * A refusal or failure reported by the relay, thrown by the {@link RelayClient} methods. Branch on
 * `code` to show the player a useful message.
 *
 * @example
 * ```ts
 * try {
 *   await relay.joinRoom(code);
 * } catch (error) {
 *   if (error instanceof RelayError && error.code === 'room-not-found') showError('No such room.');
 *   else throw error;
 * }
 * ```
 */
export class RelayError extends Error {
  constructor(
    /** What went wrong: a relay error code, `'closed'` (connection lost) or `'timeout'`. */
    readonly code: RelayErrorCode | 'closed' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'RelayError';
  }
}

/** Events of a {@link RelayClient} (`relay.events`), to update a lobby screen. */
export interface RelayEvents {
  /** The room changed: someone joined, left, got ready, or the host changed. */
  room: RoomState;
  /** The host started the match. */
  start: OnlineMatch;
  /** This machine left the room (or the room closed). */
  leftRoom: void;
  /** The connection closed. */
  close: {
    /** WebSocket close code. */
    code: number;
    /** Close reason sent by the server, often empty. */
    reason: string;
  };
}

/** Options of {@link RelayClient.connect}. */
export interface ConnectOptions {
  /** Player name shown in the lobby (1–32 characters). */
  name: string;
  /** Game id: rooms are listed per game. Use `game.config.id`. */
  game: string;
  /** Milliseconds to wait for the server. @defaultValue `8000` */
  timeout?: number;
}

/** Options of {@link RelayClient.createRoom}. */
export interface CreateRoomOptions {
  /** Player slots (1–8). @defaultValue `8` */
  maxPlayers?: number;
  /** Spectator places. @defaultValue `8` */
  maxSpectators?: number;
  /** Listed in the lobby (`listRooms`); private rooms are joined by code only. @defaultValue `false` */
  public?: boolean;
  /** Local players on this machine. @defaultValue `1` */
  players?: number;
  /** Free data for the other members (mode, settings). */
  data?: { [key: string]: JsonValue };
}

/** Options of {@link RelayClient.joinRoom}. */
export interface JoinRoomOptions {
  /** Watch without playing; the only way to enter a started room. */
  spectator?: boolean;
  /** Local players on this machine. @defaultValue `1` */
  players?: number;
}

/**
 * Turns `host`, `host:port` or a full URL into a WebSocket URL: the default port
 * ({@link DEFAULT_RELAY_PORT}) is added when missing, and `wss:` is used on an HTTPS page.
 *
 * @example
 * ```ts
 * relayUrl('192.168.1.20'); // 'ws://192.168.1.20:5360'
 * relayUrl('wss://relay.example.com'); // unchanged
 * ```
 */
export function relayUrl(address: string): string {
  if (/^wss?:\/\//.test(address)) return address;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  const withPort = /:\d+$/.test(address) ? address : `${address}:${DEFAULT_RELAY_PORT}`;
  return `${secure ? 'wss' : 'ws'}://${withPort}`;
}

/**
 * Connection to a relay server (NET-01): rooms with codes, a lobby of public rooms, ready
 * states, and the match transport once the host starts.
 *
 * @example
 * ```ts
 * const relay = await RelayClient.connect('wss://relay.example.com', { name: 'Ana', game: 'party' });
 * const room = await relay.createRoom({ maxPlayers: 4, public: true });
 * console.log('Room code', room.code);
 * relay.events.on('room', (room) => updateLobby(room));
 * const match = await relay.match(); // when the host calls relay.start()
 * ```
 */
export class RelayClient {
  /** Room changes, match start, leaving and closing. */
  readonly events = new EventBus<RelayEvents>();
  /** Current room, `undefined` outside rooms. */
  room: RoomState | undefined;
  /** This machine's member id in the room. */
  member: number | undefined;
  /** Last measured round trip in ms. */
  ping = 0;

  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (message: ServerMessage) => void; reject: (error: RelayError) => void }
  >();
  private readonly messageListeners = new Set<(data: Uint8Array, from: number) => void>();
  private readonly leaveListeners = new Set<(member: number) => void>();
  private started: OnlineMatch | undefined;
  private matchWaiters: ((match: OnlineMatch) => void)[] = [];
  private pinger: ReturnType<typeof setInterval> | undefined;

  private constructor(private readonly socket: WebSocket) {
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('message', (event) => this.onMessage(event.data));
    socket.addEventListener('close', (event) => this.onClose(event.code, event.reason));
  }

  /**
   * Connects and introduces this player.
   * @throws RelayError when the server cannot be reached, refuses the version or the name.
   */
  static connect(address: string, options: ConnectOptions): Promise<RelayClient> {
    const url = relayUrl(address);
    return new Promise((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        reject(new RelayError('closed', `Cannot open ${url}: ${String(error)}`));
        return;
      }
      const timer = setTimeout(() => {
        socket.close();
        reject(
          new RelayError(
            'timeout',
            `The relay at ${url} did not answer in ${options.timeout ?? 8000} ms. Check the address and that the server runs.`,
          ),
        );
      }, options.timeout ?? 8000);
      const fail = () => {
        clearTimeout(timer);
        reject(
          new RelayError(
            'closed',
            `Could not connect to the relay at ${url}. Check the address, the port (default ${DEFAULT_RELAY_PORT}) and the firewall.`,
          ),
        );
      };
      socket.addEventListener('error', fail, { once: true });
      socket.addEventListener('open', () => {
        socket.removeEventListener('error', fail);
        const client = new RelayClient(socket);
        const hello: ClientMessage = {
          t: 'hello',
          name: options.name,
          game: options.game,
          version: PROTOCOL_VERSION,
        };
        client.welcome = (error) => {
          clearTimeout(timer);
          if (error) reject(error);
          else {
            client.startPing();
            resolve(client);
          }
        };
        socket.send(JSON.stringify(hello));
      });
    });
  }

  private welcome: ((error?: RelayError) => void) | undefined;

  private startPing(): void {
    // Measures latency and keeps proxies from closing an idle connection.
    this.pinger = setInterval(() => {
      const sent = performance.now();
      this.request({ t: 'ping', id: 0 })
        .then(() => (this.ping = performance.now() - sent))
        .catch(() => {});
    }, 5000);
  }

  private send(message: ClientMessage): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private request(message: Extract<ClientMessage, { id: number }>): Promise<ServerMessage> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (this.socket.readyState !== WebSocket.OPEN) {
        reject(new RelayError('closed', 'The relay connection is closed; connect again.'));
        return;
      }
      this.pending.set(id, { resolve, reject });
      this.send({ ...message, id } as ClientMessage);
    });
  }

  private onMessage(data: unknown): void {
    if (data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(data);
      if (bytes.length < 1) return;
      const payload = bytes.subarray(1);
      for (const listener of this.messageListeners) listener(payload, bytes[0]!);
      return;
    }
    let message: ServerMessage;
    try {
      message = JSON.parse(String(data)) as ServerMessage;
    } catch {
      return;
    }
    const re = 're' in message ? message.re : undefined;
    const waiting = re !== undefined ? this.pending.get(re) : undefined;
    if (waiting && re !== undefined) this.pending.delete(re);
    switch (message.t) {
      case 'welcome':
        this.welcome?.();
        this.welcome = undefined;
        return;
      case 'error': {
        const error = new RelayError(message.code, message.message);
        if (this.welcome) {
          this.welcome(error);
          this.welcome = undefined;
          this.socket.close();
        } else waiting?.reject(error);
        return;
      }
      case 'room':
        this.room = message.room;
        this.member = message.you;
        this.events.emit('room', message.room);
        break;
      case 'left-room':
        this.room = undefined;
        this.member = undefined;
        this.started = undefined;
        this.events.emit('leftRoom');
        break;
      case 'start':
        this.onStart(message.start);
        break;
      case 'left':
        for (const listener of this.leaveListeners) listener(message.member);
        break;
    }
    waiting?.resolve(message);
  }

  private onStart(start: StartInfo): void {
    const self = this.member!;
    const match: OnlineMatch = {
      seed: start.seed,
      players: start.players,
      spectators: start.spectators,
      self,
      local: start.players.filter((p) => p.member === self).map((p) => p.number),
      late: start.late,
      transport: this.transport(),
    };
    this.started = match;
    this.events.emit('start', match);
    for (const waiter of this.matchWaiters) waiter(match);
    this.matchWaiters = [];
  }

  private transport(): Transport {
    return {
      send: (data, to = 0) => {
        if (data.length + 1 > MAX_MESSAGE_BYTES) {
          throw new RelayError(
            'bad-request',
            `Message of ${data.length} bytes is over the relay limit (${MAX_MESSAGE_BYTES - 1}).`,
          );
        }
        if (this.socket.readyState !== WebSocket.OPEN) return;
        const frame = new Uint8Array(data.length + 1);
        frame[0] = to;
        frame.set(data, 1);
        this.socket.send(frame);
      },
      onMessage: (listener): Unlisten => {
        this.messageListeners.add(listener);
        return () => this.messageListeners.delete(listener);
      },
      onLeave: (listener): Unlisten => {
        this.leaveListeners.add(listener);
        return () => this.leaveListeners.delete(listener);
      },
    };
  }

  private onClose(code: number, reason: string): void {
    clearInterval(this.pinger);
    for (const { reject } of this.pending.values())
      reject(new RelayError('closed', 'The relay connection closed before the answer.'));
    this.pending.clear();
    this.welcome?.(
      new RelayError('closed', `The relay closed the connection (${code} ${reason}).`),
    );
    this.welcome = undefined;
    this.events.emit('close', { code, reason });
  }

  /** Creates a room and enters it as host. */
  async createRoom(options: CreateRoomOptions = {}): Promise<RoomState> {
    const answer = await this.request({ t: 'create', id: 0, ...options });
    return (answer as Extract<ServerMessage, { t: 'room' }>).room;
  }

  /**
   * Enters a room by its code (case-insensitive).
   * @throws RelayError `room-not-found`, `room-full`, or `started` (join as spectator instead).
   */
  async joinRoom(code: string, options: JoinRoomOptions = {}): Promise<RoomState> {
    const answer = await this.request({
      t: 'join',
      id: 0,
      code: code.trim().toUpperCase(),
      ...options,
    });
    if (answer.t === 'start') return this.room!;
    return (answer as Extract<ServerMessage, { t: 'room' }>).room;
  }

  /** Public rooms of this game that have not started (the lobby). */
  async listRooms(): Promise<RoomSummary[]> {
    const answer = await this.request({ t: 'list', id: 0 });
    return (answer as Extract<ServerMessage, { t: 'rooms' }>).rooms;
  }

  /** Marks this machine ready (or not); the host can start when every player is ready. */
  setReady(ready = true): void {
    this.send({ t: 'ready', ready });
  }

  /**
   * Starts the match (host only); every member receives it through {@link match}.
   * @throws RelayError `not-host` or `not-ready` (with the names of players not ready).
   */
  async start(seed?: string): Promise<OnlineMatch> {
    await this.request(seed === undefined ? { t: 'start', id: 0 } : { t: 'start', id: 0, seed });
    return this.started!;
  }

  /** Resolves when the host starts the match (at once if it already started). */
  match(): Promise<OnlineMatch> {
    if (this.started) return Promise.resolve(this.started);
    return new Promise((resolve) => this.matchWaiters.push(resolve));
  }

  /** Leaves the room; the connection stays open for another one. */
  leave(): void {
    this.send({ t: 'leave' });
  }

  /** Closes the connection. */
  close(): void {
    clearInterval(this.pinger);
    this.socket.close();
  }
}
