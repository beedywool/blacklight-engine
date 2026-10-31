// Discord Rich Presence (SVC-03) over Discord's local RPC socket: `discord-ipc-N` (a Unix socket,
// a named pipe on Windows), frames of [opcode u32le, length u32le, JSON]. Presence, party and
// join / ask-to-join. When Discord is not running the client retries quietly.

import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { method, registerNative } from './registry';
import { v } from './validate';

const OP = { handshake: 0, frame: 1, close: 2, ping: 3, pong: 4 } as const;
const RETRY_MS = 15_000;

/** Presence shown on the player's Discord profile. */
export interface DiscordActivity {
  /** First line (what the player does). */
  details?: string;
  /** Second line (party status). */
  state?: string;
  /** Start time (ms since 1970): Discord shows the elapsed time. */
  startTimestamp?: number;
  /** End time (ms since 1970): Discord shows the time left instead. */
  endTimestamp?: number;
  /** Asset keys uploaded in the Discord developer portal. */
  largeImageKey?: string;
  /** Tooltip of the large image. */
  largeImageText?: string;
  /** Asset key of the small image drawn over the large one (a character, a rank). */
  smallImageKey?: string;
  /** Tooltip of the small image. */
  smallImageText?: string;
  /** The player's group: Discord shows "2 of 4" and the Join button with `joinSecret`. */
  party?: {
    /** Party id, the same for every member. */
    id: string;
    /** Players in the party. */
    size: number;
    /** Party capacity. */
    max: number;
    /** Secret a friend's game receives when they click Join (`onJoin`): enough to connect. */
    joinSecret?: string;
  };
}

/** A Discord user asking to join. */
export interface DiscordUser {
  /** Discord user id (a snowflake, as a string). */
  id: string;
  /** Display name. */
  name: string;
  /** Avatar hash, for `https://cdn.discordapp.com/avatars/<id>/<avatar>.png`. */
  avatar?: string;
}

/**
 * @internal Callbacks of {@link DiscordClient}; games use `discord(game)` from
 * `@blacklight/native`.
 */
export interface DiscordHandlers {
  /** Connected to Discord; `user` is the signed-in player. */
  ready?(user: DiscordUser | undefined): void;
  /** The player clicked Join on a friend's presence (or accepted an invite): connect with `secret`. */
  join?(secret: string): void;
  /** Someone asks to join the player's party: answer with `accept` or `reject`. */
  joinRequest?(user: DiscordUser): void;
}

/**
 * @internal Socket paths where Discord listens, in the order clients try them. Plumbing of the
 * built-in `discord` native module.
 */
export function discordSocketPaths(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const ids = [...Array(10).keys()];
  if (platform === 'win32') return ids.map((i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  const base = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || tmpdir();
  // Flatpak and Snap builds of Discord put the socket in their own folders.
  const dirs = [
    base,
    join(base, 'app', 'com.discordapp.Discord'),
    join(base, 'snap.discord'),
    '/tmp',
  ];
  return [...new Set(dirs)].flatMap((dir) => ids.map((i) => join(dir, `discord-ipc-${i}`)));
}

function clip(text: string | undefined): string | undefined {
  return text === undefined ? undefined : text.slice(0, 128);
}

/** Converts the game's activity to Discord's payload. */
export function toDiscordActivity(activity: DiscordActivity): Record<string, unknown> {
  const out: Record<string, unknown> = { instance: false };
  if (activity.details) out.details = clip(activity.details);
  if (activity.state) out.state = clip(activity.state);
  if (activity.startTimestamp || activity.endTimestamp) {
    out.timestamps = { start: activity.startTimestamp, end: activity.endTimestamp };
  }
  const assets: Record<string, string> = {};
  if (activity.largeImageKey) assets.large_image = activity.largeImageKey;
  if (activity.largeImageText) assets.large_text = clip(activity.largeImageText)!;
  if (activity.smallImageKey) assets.small_image = activity.smallImageKey;
  if (activity.smallImageText) assets.small_text = clip(activity.smallImageText)!;
  if (Object.keys(assets).length > 0) out.assets = assets;
  if (activity.party) {
    out.party = {
      id: activity.party.id,
      size: [Math.max(1, activity.party.size), Math.max(1, activity.party.max)],
    };
    if (activity.party.joinSecret) out.secrets = { join: activity.party.joinSecret };
  }
  return out;
}

/**
 * @internal A minimal client of Discord's local RPC protocol. Discord's SDK does the same; speaking
 * the protocol directly avoids a native library and works with every Discord build. The main
 * process starts it for `discord.appId`; games use `discord(game)` from `@blacklight/native`.
 */
export class DiscordClient {
  private socket: Socket | undefined;
  private buffer = Buffer.alloc(0);
  private ready = false;
  private activity: Record<string, unknown> | null = null;
  private sent: string | undefined;
  private nonce = 0;
  private retry: NodeJS.Timeout | undefined;
  private closed = false;

  constructor(
    private readonly clientId: string,
    private readonly handlers: DiscordHandlers = {},
    private readonly paths: string[] = discordSocketPaths(),
  ) {}

  /** Connects (and keeps reconnecting while Discord is closed). */
  connect(): void {
    this.closed = false;
    clearTimeout(this.retry);
    const tryAt = (i: number) => {
      if (this.closed) return;
      if (i >= this.paths.length) return this.scheduleRetry();
      const socket = createConnection(this.paths[i]!);
      socket.once('connect', () => this.attach(socket));
      socket.once('error', () => {
        socket.destroy();
        tryAt(i + 1);
      });
    };
    tryAt(0);
  }

  /** `true` after Discord answered the handshake. */
  get connected(): boolean {
    return this.ready;
  }

  /** Shows a presence (`null` clears it). Sent again after a reconnection. */
  setActivity(activity: DiscordActivity | null): void {
    this.activity = activity ? toDiscordActivity(activity) : null;
    this.send();
  }

  /** Accepts a join request of `userId`. */
  accept(userId: string): void {
    this.command('SEND_ACTIVITY_JOIN_INVITE', { user_id: userId });
  }

  /** Declines a join request of `userId`. */
  reject(userId: string): void {
    this.command('CLOSE_ACTIVITY_REQUEST', { user_id: userId });
  }

  /** Disconnects and stops reconnecting. */
  close(): void {
    this.closed = true;
    clearTimeout(this.retry);
    this.socket?.removeAllListeners('close');
    this.socket?.destroy();
    this.socket = undefined;
    this.ready = false;
  }

  private scheduleRetry(): void {
    if (this.closed) return;
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), RETRY_MS);
    this.retry.unref?.();
  }

  private attach(socket: Socket): void {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => this.receive(chunk));
    socket.on('close', () => {
      this.socket = undefined;
      this.ready = false;
      this.scheduleRetry();
    });
    socket.on('error', () => undefined);
    this.write(OP.handshake, { v: 1, client_id: this.clientId });
  }

  private write(op: number, payload: unknown): void {
    if (!this.socket) return;
    const json = Buffer.from(JSON.stringify(payload));
    const head = Buffer.alloc(8);
    head.writeUInt32LE(op, 0);
    head.writeUInt32LE(json.length, 4);
    this.socket.write(Buffer.concat([head, json]));
  }

  private command(cmd: string, args: Record<string, unknown>, evt?: string): void {
    this.write(OP.frame, { cmd, args, evt, nonce: String(++this.nonce) });
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const op = this.buffer.readUInt32LE(0);
      const length = this.buffer.readUInt32LE(4);
      if (this.buffer.length < 8 + length) return;
      let message: Record<string, unknown> | undefined;
      try {
        message = JSON.parse(this.buffer.subarray(8, 8 + length).toString('utf8')) as Record<
          string,
          unknown
        >;
      } catch {
        message = undefined;
      }
      this.buffer = this.buffer.subarray(8 + length);
      if (op === OP.ping) this.write(OP.pong, message);
      else if (op === OP.close) this.socket?.destroy();
      else if (message) this.dispatch(message);
    }
  }

  private dispatch(message: Record<string, unknown>): void {
    if (message.cmd !== 'DISPATCH') return;
    const data = (message.data ?? {}) as Record<string, unknown>;
    if (message.evt === 'READY') {
      this.ready = true;
      this.command('SUBSCRIBE', {}, 'ACTIVITY_JOIN');
      this.command('SUBSCRIBE', {}, 'ACTIVITY_JOIN_REQUEST');
      this.sent = undefined;
      this.send();
      this.handlers.ready?.(data.user ? toUser(data.user) : undefined);
    } else if (message.evt === 'ACTIVITY_JOIN') {
      this.handlers.join?.(String(data.secret ?? ''));
    } else if (message.evt === 'ACTIVITY_JOIN_REQUEST') {
      this.handlers.joinRequest?.(toUser(data.user));
    }
  }

  private send(): void {
    if (!this.ready) return;
    const json = JSON.stringify(this.activity);
    if (json === this.sent) return;
    this.sent = json;
    this.command('SET_ACTIVITY', { pid: process.pid, activity: this.activity });
  }
}

function toUser(value: unknown): DiscordUser {
  const user = (value ?? {}) as Record<string, unknown>;
  return {
    id: String(user.id ?? ''),
    name: String(user.global_name || user.username || ''),
    ...(user.avatar ? { avatar: String(user.avatar) } : {}),
  };
}

const short = v.optional(v.string({ max: 128 }));
const key = v.optional(v.string({ max: 256 }));
const time = v.optional(v.number({ min: 0 }));
const activityShape = v.object({
  details: short,
  state: short,
  startTimestamp: time,
  endTimestamp: time,
  largeImageKey: key,
  largeImageText: short,
  smallImageKey: key,
  smallImageText: short,
  party: v.optional(
    v.object({
      id: v.string({ min: 1, max: 128 }),
      size: v.integer({ min: 1, max: 1000 }),
      max: v.integer({ min: 1, max: 1000 }),
      joinSecret: v.optional(v.string({ min: 1, max: 128 })),
    }),
  ),
});

/**
 * Registers the `discord` native module for `appId` and forwards Discord events to the game as
 * `discord:ready`, `discord:join` and `discord:joinRequest`.
 */
export function startDiscord(
  appId: string,
  emit: (event: string, payload: unknown) => void,
  paths?: string[],
): () => void {
  const client = new DiscordClient(
    appId,
    {
      ready: (user) => emit('discord:ready', { user }),
      join: (secret) => emit('discord:join', { secret }),
      joinRequest: (user) => emit('discord:joinRequest', { user }),
    },
    paths,
  );
  client.connect();
  const userId = v.string({ pattern: /^\d{5,25}$/ });
  const unregister = registerNative('discord', {
    setActivity: method([activityShape], (activity) => client.setActivity(activity)),
    clearActivity: method([], () => client.setActivity(null)),
    accept: method([userId], (id) => client.accept(id)),
    reject: method([userId], (id) => client.reject(id)),
    connected: method([], () => client.connected),
  });
  return () => {
    unregister();
    client.close();
  };
}
