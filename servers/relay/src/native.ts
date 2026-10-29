import { startRelay, type RelayServer } from './server';

/** What `hostLan()` in the game receives (`@blacklight/net` `LanRelay`). */
export interface LanRelayInfo {
  port: number;
  urls: string[];
  local: string;
}

/** Methods of the `relay` native module, called from the game through `platform.invoke`. */
export interface RelayNativeModule {
  /** Starts the LAN relay (or returns the running one). Argument: `{ port?: number }`. */
  start(options?: unknown): Promise<LanRelayInfo>;
  /** Stops it; members of its rooms are disconnected. */
  stop(): Promise<void>;
  /** Whether it runs, and its counts. */
  status(): Promise<{ running: boolean; port?: number; rooms: number; peers: number }>;
}

/**
 * The `relay` native module for the desktop app (NET-01 LAN hosting). `@blacklight/native`
 * registers it in Electron's main process under the name `relay`; the game calls it with
 * `hostLan(game)` from `@blacklight/net`. Arguments come from the renderer and are validated.
 *
 * @example
 * ```ts
 * // Electron main process (packages/native)
 * import { relayNativeModule } from '@blacklight/relay';
 * registerNative('relay', relayNativeModule());
 * ```
 */
export function relayNativeModule(): RelayNativeModule {
  let server: RelayServer | undefined;
  const info = (s: RelayServer): LanRelayInfo => ({ port: s.port, urls: s.urls, local: s.local });
  return {
    async start(options) {
      if (server) return info(server);
      let port: number | undefined;
      if (options !== undefined && options !== null) {
        if (typeof options !== 'object')
          throw new TypeError('relay.start expects `{ port?: number }`.');
        const value = (options as { port?: unknown }).port;
        if (value !== undefined) {
          if (
            typeof value !== 'number' ||
            !Number.isInteger(value) ||
            value < 1024 ||
            value > 65535
          )
            throw new RangeError(
              `relay.start: port must be an integer from 1024 to 65535, got ${String(value)}.`,
            );
          port = value;
        }
      }
      server = await startRelay({ port });
      return info(server);
    },
    async stop() {
      const running = server;
      server = undefined;
      await running?.close();
    },
    async status() {
      if (!server) return { running: false, rooms: 0, peers: 0 };
      const { rooms, peers } = server.hub.stats();
      return { running: true, port: server.port, rooms, peers };
    },
  };
}
