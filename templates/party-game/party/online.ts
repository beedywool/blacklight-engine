// Online parties through the BlackLight relay (`servers/relay`, or the LAN relay of the desktop
// app): one connection per page, rooms that carry the chosen mini-game and its settings.
import type { Game } from '@blacklight/core';
import { DEFAULT_RELAY_PORT, RelayClient, relayUrl, type RoomState } from '@blacklight/net';
import { MINI_GAMES, defaultSettings, type MiniGameId, type MiniGameSettings } from './catalog';

const RELAY_SETTING = 'online.relay';

/** Relay address typed last, or the local relay. */
export function savedRelay(game: Game): string {
  return game.settings.get<string>(RELAY_SETTING) ?? `localhost:${DEFAULT_RELAY_PORT}`;
}

let client: RelayClient | undefined;

/**
 * Opens a fresh connection (a started match stays attached to its connection) and remembers the
 * address for next time.
 */
export async function connect(game: Game, address: string, name: string): Promise<RelayClient> {
  client?.close();
  const relay = await RelayClient.connect(relayUrl(address.trim()), {
    name: name.slice(0, 32) || 'GUEST',
    game: game.config.id,
  });
  client = relay;
  relay.events.on('close', () => {
    if (client === relay) client = undefined;
  });
  game.settings.set(RELAY_SETTING, address.trim());
  return relay;
}

export function disconnect(): void {
  client?.close();
  client = undefined;
}

/** What a room says about the match it will play. */
export interface RoomGame {
  game: MiniGameId;
  settings: MiniGameSettings;
}

/** Reads the mini-game a room was created for (room data are free JSON, so they are checked). */
export function roomGame(room: RoomState): RoomGame {
  const game = MINI_GAMES.find((g) => g.scene === room.data.game)?.scene ?? 'push-push';
  const raw = room.data.settings;
  const settings: MiniGameSettings =
    Array.isArray(raw) && raw.length === 2 && raw.every((v) => typeof v === 'number')
      ? [raw[0] as number, raw[1] as number]
      : defaultSettings(game);
  return { game, settings };
}

/** Creates a room for a mini-game; others join with its code. */
export async function host(
  relay: RelayClient,
  choice: RoomGame,
  maxPlayers: number,
): Promise<RoomState> {
  return relay.createRoom({
    maxPlayers,
    data: { game: choice.game, settings: [...choice.settings] },
  });
}

/** Starts the match when every other player is ready (host only). */
export function canStart(relay: RelayClient, minPlayers: number): boolean {
  const room = relay.room;
  if (!room || room.host !== relay.member) return false;
  const players = room.members.filter((m) => !m.spectator);
  return players.length >= minPlayers && players.every((m) => m.id === room.host || m.ready);
}
