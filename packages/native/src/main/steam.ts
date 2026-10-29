// Steamworks (PF-05) through steamworks.js: achievements, Steam Cloud, rich presence and the
// overlay (with Electron's known workarounds, L3).

import { method, registerNative } from './registry';
import { v } from './validate';

/** The part of a steamworks.js client used here. */
export interface SteamClient {
  achievement: {
    activate(name: string): boolean;
    isActivated(name: string): boolean;
    clear(name: string): boolean;
  };
  cloud: {
    isEnabledForAccount(): boolean;
    isEnabledForApp(): boolean;
    readFile(name: string): string;
    writeFile(name: string, content: string): boolean;
    deleteFile(name: string): boolean;
    fileExists(name: string): boolean;
    listFiles(): { name: string; size: bigint }[];
  };
  localplayer: {
    getName(): string;
    getSteamId(): { steamId64: bigint };
    setRichPresence(key: string, value?: string | null): void;
  };
  overlay: {
    activateDialog(dialog: number): void;
    activateToWebPage(url: string): void;
  };
  stats: { store(): boolean };
}

/** steamworks.js itself. */
export interface Steamworks {
  init(appId?: number): SteamClient;
  restartAppIfNecessary(appId: number): boolean;
  electronEnableSteamOverlay(disableEachFrameInvalidation?: boolean): void;
}

const LEADERBOARDS =
  'Steam leaderboards are not available: steamworks.js 0.4.0 does not expose them. Use the reference server for scores.';

const OVERLAY_DIALOGS = [
  'friends',
  'community',
  'players',
  'settings',
  'officialgamegroup',
  'stats',
  'achievements',
] as const;

/** Steam Cloud file names: flat, short, safe on every OS. */
const CLOUD_NAME = v.string({ min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ });
const ACHIEVEMENT = v.string({ min: 1, max: 128, pattern: /^[A-Za-z0-9_.-]+$/ });

/**
 * Connects to the Steam client and registers the `steam` native module. Cloud files are text: bytes
 * travel base64-encoded.
 *
 * @returns `undefined` when Steam is not running or the app is not owned (the game then runs
 * without Steam features; `game.platform.steam` is `false`).
 */
export function startSteam(steamworks: Steamworks, appId: number): (() => void) | undefined {
  let client: SteamClient;
  try {
    client = steamworks.init(appId);
  } catch (error) {
    console.warn(
      `[blacklight] Steam is not available (${(error as Error).message}): start the game from the Steam client.`,
    );
    return undefined;
  }
  const cloudOn = () => client.cloud.isEnabledForAccount() && client.cloud.isEnabledForApp();
  return registerNative('steam', {
    // Achievements are stored right away so they survive a crash.
    unlock: method(
      [ACHIEVEMENT],
      (name) => client.achievement.activate(name) && client.stats.store(),
    ),
    // Names used by the achievements module (SVC-02).
    activateAchievement: method(
      [ACHIEVEMENT],
      (name) => client.achievement.activate(name) && client.stats.store(),
    ),
    uploadScore: method([v.string({ min: 1, max: 128 }), v.number()], () => {
      throw new Error(LEADERBOARDS);
    }),
    getScores: method(
      [v.string({ min: 1, max: 128 }), v.optional(v.integer({ min: 1, max: 100 }))],
      () => {
        throw new Error(LEADERBOARDS);
      },
    ),
    isUnlocked: method([ACHIEVEMENT], (name) => client.achievement.isActivated(name)),
    clear: method([ACHIEVEMENT], (name) => client.achievement.clear(name) && client.stats.store()),
    player: method([], () => ({
      name: client.localplayer.getName(),
      steamId: String(client.localplayer.getSteamId().steamId64),
    })),
    setRichPresence: method(
      [
        v.string({ min: 1, max: 64, pattern: /^[A-Za-z0-9_#]+$/ }),
        v.optional(v.string({ max: 256 })),
      ],
      (key, value) => client.localplayer.setRichPresence(key, value ?? null),
    ),
    clearRichPresence: method([], () => client.localplayer.setRichPresence('', null)),
    openOverlay: method([v.literal(...OVERLAY_DIALOGS)], (dialog) =>
      client.overlay.activateDialog(OVERLAY_DIALOGS.indexOf(dialog)),
    ),
    openOverlayUrl: method([v.string({ max: 2048, pattern: /^https:\/\// })], (url) =>
      client.overlay.activateToWebPage(url),
    ),
    cloudEnabled: method([], cloudOn),
    cloudList: method([], () =>
      cloudOn()
        ? client.cloud.listFiles().map((file) => ({ name: file.name, size: Number(file.size) }))
        : [],
    ),
    // Cloud files cross the bridge as base64 text (what Steam stores): the cloud-save module and
    // `steam(game).cloud` encode on the game side.
    cloudRead: method([CLOUD_NAME], (name) =>
      cloudOn() && client.cloud.fileExists(name) ? client.cloud.readFile(name) : null,
    ),
    cloudWrite: method(
      [CLOUD_NAME, v.string({ max: 70 * 1024 * 1024, pattern: /^[A-Za-z0-9+/=]*$/ })],
      (name, base64) => {
        if (!cloudOn()) throw new Error('Steam Cloud is turned off for this player or this app.');
        if (!client.cloud.writeFile(name, base64)) {
          throw new Error(`Steam Cloud refused to write "${name}" (quota or Steam offline).`);
        }
      },
    ),
    cloudDelete: method([CLOUD_NAME], (name) => cloudOn() && client.cloud.deleteFile(name)),
  });
}
