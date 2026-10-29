// Client side of the dev-only debug channel (`installDebugChannel` in `@blacklight/core/debug`):
// connects to the dev server's WebSocket like a browser tab and exchanges `blacklight:debug`
// messages with the running games.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEBUG_EVENT = 'blacklight:debug';

/** `.blacklight/dev-server.json`, written by `blacklight dev`. */
export interface DevServerInfo {
  url: string;
  port: number;
  token: string;
  pid: number;
}

/** The running dev server of a game, or `undefined` when none is running. */
export function readDevServer(
  root: string,
  alive: (pid: number) => boolean = processAlive,
): DevServerInfo | undefined {
  const file = join(root, '.blacklight', 'dev-server.json');
  if (!existsSync(file)) return undefined;
  try {
    const info = JSON.parse(readFileSync(file, 'utf8')) as DevServerInfo;
    return alive(info.pid) ? info : undefined;
  } catch {
    return undefined;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** WebSocket URL of the dev server's HMR channel. */
export function socketUrl(info: DevServerInfo): string {
  const url = new URL(info.url);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/';
  url.search = `?token=${encodeURIComponent(info.token)}`;
  return url.toString();
}

/** A game that announced itself. */
export interface GameClient {
  client: string;
  url?: string;
  title?: string;
  scene?: string;
}

interface Message {
  kind: 'request' | 'response' | 'event';
  id?: string;
  client?: string;
  type?: string;
  result?: unknown;
  error?: string;
  data?: unknown;
}

/** Minimal WebSocket shape (the global one in Node 22+ and in browsers). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(
    type: 'open' | 'close' | 'error' | 'message',
    listener: (event: { data?: unknown }) => void,
  ): void;
}

export type SocketFactory = (url: string, protocol: string) => SocketLike;

const defaultFactory: SocketFactory = (url, protocol) =>
  new (
    globalThis as unknown as { WebSocket: new (url: string, protocol: string) => SocketLike }
  ).WebSocket(url, protocol);

/**
 * Talks to the games of one dev server.
 *
 * @example
 * ```ts
 * const client = await DebugClient.connect(readDevServer(root)!);
 * const { objects } = await client.request<{ objects: unknown[] }>('objects');
 * ```
 */
export class DebugClient {
  /** Games that said hello (by client id). */
  readonly games = new Map<string, GameClient>();
  private readonly pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly listeners = new Set<
    (event: { client: string; type: string; data?: unknown }) => void
  >();
  private next = 0;
  closed = false;

  private constructor(private readonly socket: SocketLike) {
    socket.addEventListener('message', (event) => this.receive(String(event.data)));
    socket.addEventListener('close', () => {
      this.closed = true;
      for (const [, pending] of this.pending)
        pending.reject(new Error('The dev server closed the connection.'));
      this.pending.clear();
    });
  }

  /** Opens the connection; rejects when the dev server does not answer. */
  static connect(
    info: DevServerInfo,
    factory: SocketFactory = defaultFactory,
    timeout = 5000,
  ): Promise<DebugClient> {
    return new Promise((resolve, reject) => {
      const socket = factory(socketUrl(info), 'vite-hmr');
      const timer = setTimeout(() => {
        socket.close();
        reject(
          new Error(
            `No answer from the dev server at ${info.url}. Start it with \`blacklight dev\`.`,
          ),
        );
      }, timeout);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve(new DebugClient(socket));
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(
          new Error(
            `Cannot connect to the dev server at ${info.url}. Start it with \`blacklight dev\`.`,
          ),
        );
      });
    });
  }

  private receive(raw: string): void {
    let payload: { type?: string; event?: string; data?: Message };
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      return;
    }
    if (payload.type !== 'custom' || payload.event !== DEBUG_EVENT || !payload.data) return;
    const message = payload.data;
    if (message.kind === 'response' && message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error));
      else pending.resolve(message.result);
    } else if (message.kind === 'event' && message.client && message.type) {
      if (message.type === 'hello')
        this.games.set(message.client, { client: message.client, ...(message.data as object) });
      for (const listener of this.listeners)
        listener({ client: message.client, type: message.type, data: message.data });
    }
  }

  /** Calls a debug method; the first game to answer (or `target`) wins. */
  request<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options: { target?: string; timeout?: number } = {},
  ): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Not connected to the dev server.'));
    const id = `vscode-${++this.next}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `No game answered "${method}". Open the game in a browser (the URL \`blacklight dev\` printed).`,
          ),
        );
      }, options.timeout ?? 3000);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.socket.send(
        JSON.stringify({
          type: 'custom',
          event: DEBUG_EVENT,
          data: {
            kind: 'request',
            id,
            method,
            params,
            ...(options.target && { target: options.target }),
          },
        }),
      );
    });
  }

  /** Games send `hello` when they start and `scene` when the scene changes. */
  onEvent(listener: (event: { client: string; type: string; data?: unknown }) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.socket.close();
  }
}
