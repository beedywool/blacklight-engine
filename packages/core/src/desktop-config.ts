/**
 * `window` in `game.config.ts`: the desktop window (Electron). The content keeps the aspect ratio
 * of `resolution` in windowed mode.
 *
 * @example
 * ```ts
 * window: { fullscreen: true, resizable: true, minSize: { width: 960, height: 540 } }
 * ```
 */
export interface WindowConfig {
  /** Start in fullscreen; the player's last choice wins afterwards. @defaultValue `false` */
  fullscreen?: boolean;
  /** @defaultValue `true` */
  resizable?: boolean;
  /** Smallest content size. @defaultValue half the design resolution */
  minSize?: { width: number; height: number };
  /** First windowed content size. @defaultValue the design resolution, scaled to fit the screen */
  size?: { width: number; height: number };
}

/** `steam` in `game.config.ts` (steam target). */
export interface SteamConfig {
  /** Steam App ID (480, "Spacewar", is Valve's test app). */
  appId: number;
  /** Depot IDs for the upload script, per OS. @defaultValue `appId + 1`, `+ 2`, `+ 3` */
  depots?: { windows?: number; mac?: number; linux?: number };
}

/** `discord` in `game.config.ts` (Rich Presence on desktop). */
export interface DiscordConfig {
  /** Application ID from the Discord developer portal. */
  appId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSize(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isInteger(value.width) &&
    Number.isInteger(value.height) &&
    (value.width as number) > 0 &&
    (value.height as number) > 0
  );
}

/** Checks `window`, `steam` and `discord`; returns one readable line per problem. */
export function validateDesktopConfig(input: {
  window?: unknown;
  steam?: unknown;
  discord?: unknown;
}): string[] {
  const issues: string[] = [];
  const { window, steam, discord } = input;
  if (window !== undefined) {
    if (!isRecord(window)) {
      issues.push('`window` must be an object, e.g. `window: { fullscreen: true }`');
    } else {
      for (const key of ['fullscreen', 'resizable'] as const) {
        if (window[key] !== undefined && typeof window[key] !== 'boolean') {
          issues.push(`\`window.${key}\` must be a boolean`);
        }
      }
      for (const key of ['minSize', 'size'] as const) {
        if (window[key] !== undefined && !isSize(window[key])) {
          issues.push(
            `\`window.${key}\` must be \`{ width, height }\` in positive integers, e.g. \`{ width: 960, height: 540 }\``,
          );
        }
      }
    }
  }
  if (steam !== undefined) {
    if (!isRecord(steam) || !Number.isInteger(steam.appId) || (steam.appId as number) <= 0) {
      issues.push('`steam.appId` must be your Steam App ID, e.g. `steam: { appId: 480 }`');
    } else if (steam.depots !== undefined) {
      const depots = steam.depots;
      if (
        !isRecord(depots) ||
        Object.entries(depots).some(
          ([os, id]) =>
            !['windows', 'mac', 'linux'].includes(os) ||
            !Number.isInteger(id) ||
            (id as number) <= 0,
        )
      ) {
        issues.push('`steam.depots` must map windows, mac, linux to depot IDs');
      }
    }
  }
  if (discord !== undefined) {
    if (
      !isRecord(discord) ||
      typeof discord.appId !== 'string' ||
      !/^\d{5,25}$/.test(discord.appId)
    ) {
      issues.push(
        '`discord.appId` must be the application ID from the Discord developer portal, as a string of digits',
      );
    }
  }
  return issues;
}
