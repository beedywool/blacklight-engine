import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import { WebSocketServer, type WebSocket } from 'ws';
import { DEFAULT_RELAY_PORT, MAX_MESSAGE_BYTES } from '@blacklight/net/protocol';
import { RelayHub, type HubOptions } from './hub';

/** Options of {@link startRelay}. */
export interface RelayOptions extends HubOptions {
  /** TCP port; 0 picks a free one. @defaultValue `5360` (`BLACKLIGHT_RELAY_PORT`) */
  port?: number;
  /** Interface to listen on. @defaultValue `'0.0.0.0'` (every interface, for LAN play) */
  host?: string;
  /** Milliseconds between keepalive pings; silent connections are closed after two. @defaultValue `20000` */
  keepalive?: number;
}

/** A running relay. */
export interface RelayServer {
  readonly port: number;
  /** Addresses for other machines on the network (`ws://192.168.1.20:5360`). */
  readonly urls: string[];
  /** Address for this machine (`ws://127.0.0.1:5360`). */
  readonly local: string;
  readonly hub: RelayHub;
  /** Closes every connection and the port. */
  close(): Promise<void>;
}

/** IPv4 LAN addresses of this machine, as relay URLs. */
function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const address of list ?? []) {
      if (address.family === 'IPv4' && !address.internal)
        urls.push(`ws://${address.address}:${port}`);
    }
  }
  // Home networks first; 172.x is often a Docker or VM bridge.
  const rank = (url: string) => (url.includes('//192.168.') ? 0 : url.includes('//10.') ? 1 : 2);
  return urls.sort((a, b) => rank(a) - rank(b));
}

/**
 * Starts a relay server: WebSocket on `/`, health check on `/health`. Used by the Docker image
 * (`blacklight-relay` command) and by the desktop app for LAN hosting (Electron main process).
 *
 * @example
 * ```ts
 * import { startRelay } from '@blacklight/relay';
 *
 * const relay = await startRelay({ port: 5360 });
 * console.log('Players connect to', relay.urls[0]);
 * // later
 * await relay.close();
 * ```
 */
export async function startRelay(options: RelayOptions = {}): Promise<RelayServer> {
  const hub = new RelayHub(options);
  const http: Server = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, ...hub.stats() }));
      return;
    }
    response.writeHead(426, { 'content-type': 'text/plain' });
    response.end(
      'Blacklight relay: connect with a WebSocket (RelayClient from @blacklight/net).\n',
    );
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_MESSAGE_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();
  wss.on('connection', (socket) => {
    alive.set(socket, true);
    const peer = hub.connect({
      send: (data) => {
        if (socket.readyState === socket.OPEN) socket.send(data);
      },
      close: (code, reason) => socket.close(code, reason),
    });
    socket.on('pong', () => alive.set(socket, true));
    socket.on('message', (data, isBinary) => {
      alive.set(socket, true);
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      peer.receive(
        isBinary
          ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          : bytes.toString('utf8'),
      );
    });
    socket.on('close', () => peer.close());
    socket.on('error', () => socket.terminate());
  });
  // Connections that vanished without closing (sleep, Wi-Fi loss) leave their rooms after two
  // missed pings; browsers answer pings on their own.
  const timer = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, options.keepalive ?? 20_000);
  timer.unref();

  const requested = options.port ?? DEFAULT_RELAY_PORT;
  await new Promise<void>((resolve, reject) => {
    http.once('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(`Port ${requested} is in use: stop the other relay or pass another port.`, {
              cause: error,
            })
          : error,
      ),
    );
    http.listen(requested, options.host ?? '0.0.0.0', () => resolve());
  });
  const address = http.address();
  const port = typeof address === 'object' && address ? address.port : requested;
  return {
    port,
    urls: lanUrls(port),
    local: `ws://127.0.0.1:${port}`,
    hub,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        for (const socket of wss.clients) socket.terminate();
        wss.close(() => http.close(() => resolve()));
      }),
  };
}
