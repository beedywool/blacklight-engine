import type {
  CloudSaveEntry,
  CloudSaveProvider,
  Game,
  SavePayload,
  Unsubscribe,
} from '@blacklight/core';
import type { DiscordActivity, DiscordUser } from '../main/discord';

export type { DiscordActivity, DiscordUser };

/** Discord Rich Presence from the game, see {@link discord}. */
export interface DiscordPresence {
  /** `true` in the desktop app with `discord.appId` set in game.config.ts. */
  readonly available: boolean;
  /** Shows what the player does; the party adds "2 of 4" and, with `joinSecret`, the Join button. */
  setActivity(activity: DiscordActivity): Promise<void>;
  /** Removes the presence from the player's profile. */
  clearActivity(): Promise<void>;
  /** Lets a user who asked to join in (see {@link onJoinRequest}). */
  accept(userId: string): Promise<void>;
  /** Declines a join request (see {@link onJoinRequest}). */
  reject(userId: string): Promise<void>;
  /** The player joined a friend's party from Discord: connect to the game the secret names. */
  onJoin(listener: (secret: string) => void): Unsubscribe;
  /** Someone asks to join the player's party. */
  onJoinRequest(listener: (user: DiscordUser) => void): Unsubscribe;
  /** Discord is connected (also after Discord restarts). */
  onReady(listener: (user: DiscordUser | undefined) => void): Unsubscribe;
}

/**
 * Discord Rich Presence (desktop): presence, party, join and ask-to-join. On the web, or without
 * `discord: { appId }` in game.config.ts, every call does nothing, so the same code runs everywhere.
 *
 * @example
 * ```ts
 * const presence = discord(this.game);
 * await presence.setActivity({
 *   details: 'Air Hockey',
 *   state: 'In a match',
 *   party: { id: room.id, size: 2, max: 4, joinSecret: room.code },
 * });
 * presence.onJoin((code) => this.game.goto('lobby', { code }));
 * presence.onJoinRequest((user) => presence.accept(user.id));
 * ```
 */
export function discord(game: Game): DiscordPresence {
  const platform = game.platform;
  const available = platform.name === 'desktop';
  const call = async (method: string, ...args: unknown[]) => {
    if (!available) return;
    try {
      await platform.invoke('discord', method, ...args);
    } catch (error) {
      if (/No native module "discord"/.test((error as Error).message)) return;
      throw error;
    }
  };
  const listen =
    <T>(event: string, pick: (payload: Record<string, unknown>) => T) =>
    (listener: (value: T) => void): Unsubscribe =>
      platform.on(`discord:${event}`, (payload) =>
        listener(pick(payload as Record<string, unknown>)),
      );
  return {
    available,
    setActivity: (activity) => call('setActivity', activity),
    clearActivity: () => call('clearActivity'),
    accept: (userId) => call('accept', userId),
    reject: (userId) => call('reject', userId),
    onJoin: listen('join', (p) => String(p.secret)),
    onJoinRequest: listen('joinRequest', (p) => p.user as DiscordUser),
    onReady: listen('ready', (p) => p.user as DiscordUser | undefined),
  };
}

/** Steam overlay pages. */
export type SteamOverlayDialog =
  'friends' | 'community' | 'players' | 'settings' | 'officialgamegroup' | 'stats' | 'achievements';

/** Steamworks from the game, see {@link steam}. */
export interface SteamServices {
  /** `true` when the game runs from the Steam client (`steam` target). */
  readonly available: boolean;
  /** Unlocks an achievement (its API name from the Steamworks partner site). */
  unlock(achievement: string): Promise<boolean>;
  /** `true` when the player has the achievement (`false` outside Steam). */
  isUnlocked(achievement: string): Promise<boolean>;
  /** Locks it again (testing). */
  clear(achievement: string): Promise<boolean>;
  /** The signed-in player. */
  player(): Promise<
    | {
        /** Steam persona name. */
        name: string;
        /** SteamID64, as a string. */
        steamId: string;
      }
    | undefined
  >;
  /** Rich presence key (`status`, `steam_display`, `steam_player_group`…). */
  setRichPresence(key: string, value?: string): Promise<void>;
  /** Removes every rich presence key. */
  clearRichPresence(): Promise<void>;
  /** Opens the overlay (may not show in Electron, see the accepted limitations). */
  openOverlay(dialog: SteamOverlayDialog): Promise<void>;
  /** Steam Cloud as a cloud-save provider: `game.save.useCloud(steam(game).cloud)`. */
  readonly cloud: CloudSaveProvider;
}

const SAVE_FILE = /^save-([A-Za-z0-9_-]+)\.json$/;

/**
 * Steamworks (desktop `steam` target): achievements, rich presence, overlay and Steam Cloud. On
 * other targets `available` is `false` and calls resolve without doing anything.
 *
 * @example
 * ```ts
 * const services = steam(this.game);
 * await services.unlock('FIRST_WIN');
 * await services.setRichPresence('steam_display', '#InMatch');
 * this.game.save.useCloud(services.cloud);
 * ```
 */
export function steam(game: Game): SteamServices {
  const platform = game.platform;
  const available = platform.steam;
  const call = async <T>(method: string, fallback: T, ...args: unknown[]): Promise<T> =>
    available ? platform.invoke<T>('steam', method, ...args) : fallback;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const download = async (slot: string): Promise<SavePayload | undefined> => {
    const base64 = await call<string | null>('cloudRead', null, `save-${slot}.json`);
    if (!base64) return undefined;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSON.parse(decoder.decode(bytes)) as SavePayload;
  };

  const cloud: CloudSaveProvider = {
    name: 'steam',
    async list() {
      const files = await call<{ name: string }[]>('cloudList', []);
      const entries: CloudSaveEntry[] = [];
      for (const file of files) {
        const slot = SAVE_FILE.exec(file.name)?.[1];
        const payload = slot ? await download(slot) : undefined;
        if (slot && payload)
          entries.push({ slot, date: payload.meta.date, playTime: payload.meta.playTime });
      }
      return entries;
    },
    download,
    upload: async (slot, payload) => {
      let binary = '';
      for (const byte of encoder.encode(JSON.stringify(payload)))
        binary += String.fromCharCode(byte);
      await call('cloudWrite', undefined, `save-${slot}.json`, btoa(binary));
    },
    remove: async (slot) => {
      await call('cloudDelete', false, `save-${slot}.json`);
    },
  };
  return {
    available,
    unlock: (name) => call('unlock', false, name),
    isUnlocked: (name) => call('isUnlocked', false, name),
    clear: (name) => call('clear', false, name),
    player: () => call('player', undefined),
    setRichPresence: (key, value) => call('setRichPresence', undefined, key, value),
    clearRichPresence: () => call('clearRichPresence', undefined),
    openOverlay: (dialog) => call('openOverlay', undefined, dialog),
    cloud,
  };
}

/**
 * Switches the desktop window between fullscreen and windowed (the choice is remembered). F11 and
 * Alt+Enter do the same. No effect on the web.
 *
 * @example
 * ```ts
 * await setFullscreen(this.game, !(await isFullscreen(this.game)));
 * ```
 */
export async function setFullscreen(game: Game, on: boolean): Promise<void> {
  if (game.platform.name !== 'desktop') {
    if (on) await document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) await document.exitFullscreen();
    return;
  }
  await game.platform.invoke('window', 'setFullscreen', on);
}

/**
 * `true` when the window (or the page, on the web) is fullscreen. Use it to show the current state
 * in a settings menu.
 *
 * @example
 * ```ts
 * import { isFullscreen } from '@blacklight/native';
 *
 * fullscreenToggle.checked = await isFullscreen(this.game);
 * ```
 */
export async function isFullscreen(game: Game): Promise<boolean> {
  if (game.platform.name !== 'desktop') return !!document.fullscreenElement;
  return game.platform.invoke<boolean>('window', 'isFullscreen');
}
