import type { Game } from '@blacklight/core';

/** A relay running inside the desktop app, from {@link hostLan}. */
export interface LanRelay {
  /** Port the relay listens on. */
  port: number;
  /** Addresses other players on the network type in (`ws://192.168.1.20:5360`), LAN first. */
  urls: string[];
  /** Address this machine connects to (`ws://127.0.0.1:5360`). */
  local: string;
}

/**
 * Starts a relay server inside the desktop app so players on the same network join without an
 * internet server (NET-01, LAN hosting). Needs the desktop build: `@blacklight/native` provides
 * the `relay` native module, which runs `startRelay()` from `@blacklight/relay` in Electron's
 * main process.
 *
 * @example
 * ```ts
 * const lan = await hostLan(this.game);
 * const relay = await RelayClient.connect(lan.local, { name: 'Host', game: this.game.config.id });
 * const room = await relay.createRoom();
 * this.showCode(room.code, lan.urls[0]);
 * ```
 * @throws Error on the web and mobile, where a game cannot open a server port.
 */
export async function hostLan(game: Game, options: { port?: number } = {}): Promise<LanRelay> {
  try {
    return await game.platform.invoke<LanRelay>('relay', 'start', { port: options.port });
  } catch (error) {
    throw new Error(
      `LAN hosting needs the desktop app (platform "${game.platform.name}" has no "relay" native module): ${String(error)}. On the web, connect to a relay server with RelayClient.connect(url).`,
      { cause: error },
    );
  }
}

/**
 * Stops the LAN relay started by {@link hostLan}; members in its rooms are disconnected. Call it
 * when the host leaves the online menu.
 *
 * @example
 * ```ts
 * relay.close();
 * await stopLan(this.game);
 * ```
 */
export async function stopLan(game: Game): Promise<void> {
  await game.platform.invoke('relay', 'stop');
}
