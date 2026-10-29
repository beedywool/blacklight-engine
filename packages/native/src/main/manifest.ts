import type { SaveLocation, WindowConfig } from '@blacklight/core/config';

/**
 * `blacklight.json`, written by the CLI next to the main script: everything the main process
 * needs from `game.config.ts` (which it cannot import: the config is TypeScript for the page).
 */
export interface AppManifest {
  name: string;
  id: string;
  version: string;
  resolution: { width: number; height: number };
  window: WindowConfig;
  /** Release build: the security measures below apply. */
  release: boolean;
  security: {
    devtools: boolean;
    debugger: boolean;
    /** Content-Security-Policy header of every page response, `null` to send none. */
    csp: string | null;
  };
  save: { location?: string | SaveLocation };
  steam?: { appId: number };
  discord?: { appId: string };
  /** Folder of the web build, relative to the manifest. @defaultValue `'game'` */
  gameDir?: string;
  /** Dev only: load the page from this Vite dev server instead of the app protocol. */
  devServer?: string;
  /** Main-process modules to load (`defineNative`), relative to the manifest. */
  natives?: string[];
}

/** Scheme the game is served from: `app://game/index.html`. */
export const APP_SCHEME = 'app';
export const APP_HOST = 'game';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
