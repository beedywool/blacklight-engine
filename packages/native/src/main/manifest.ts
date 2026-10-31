import type { SaveLocation, WindowConfig } from '@blacklight/core/config';

/**
 * `blacklight.json`, written by the CLI next to the main script: everything the main process
 * needs from `game.config.ts` (which it cannot import: the config is TypeScript for the page).
 */
export interface AppManifest {
  /** Display name: window title and app name. */
  name: string;
  /** Game id (reverse domain): data folder name and deep-link scheme. */
  id: string;
  /** Game version, reported to the page. */
  version: string;
  /** Logical resolution of the game, for the window's size and aspect ratio. */
  resolution: {
    /** Width in game pixels. */
    width: number;
    /** Height in game pixels. */
    height: number;
  };
  /** Window settings from `game.config.ts`. */
  window: WindowConfig;
  /** Release build: the security measures below apply. */
  release: boolean;
  /** Resolved security settings (see `resolveSecurity` in `@blacklight/core/config`). */
  security: {
    /** Developer tools are blocked and reported as tampering. */
    devtools: boolean;
    /** Debugger switches (`--inspect`, `--remote-debugging-port`) are refused. */
    debugger: boolean;
    /** Content-Security-Policy header of every page response, `null` to send none. */
    csp: string | null;
  };
  /** Where saves go. */
  save: {
    /** Data folder override, one path or one per OS (`~` and environment variables expand). */
    location?: string | SaveLocation;
  };
  /** Steam target only: Steamworks starts with this app. */
  steam?: {
    /** Steam app id. */
    appId: number;
  };
  /** Discord Rich Presence is on for this application. */
  discord?: {
    /** Discord application id. */
    appId: string;
  };
  /** Folder of the web build, relative to the manifest. @defaultValue `'game'` */
  gameDir?: string;
  /** Dev only: load the page from this Vite dev server instead of the app protocol. */
  devServer?: string;
  /** Main-process modules to load (`defineNative`), relative to the manifest. */
  natives?: string[];
}

/** Scheme the game is served from: `app://game/index.html`. */
export const APP_SCHEME = 'app';
/** Host part of the game's URL. */
export const APP_HOST = 'game';
/**
 * Origin of the game page in the desktop app (`app://game`). Main-process code that checks where
 * a request or message comes from compares against it.
 */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
