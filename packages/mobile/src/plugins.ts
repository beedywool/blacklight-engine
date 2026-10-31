import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, SystemBars, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { CapacitorSQLite } from '@capacitor-community/sqlite';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

/** Removes a native listener. */
export interface ListenerHandle {
  /** Stops the listener; native events no longer reach it. */
  remove(): Promise<void>;
}

/**
 * The Capacitor plugins the mobile platform talks to, reduced to the calls it makes. Tests pass
 * fakes; {@link capacitorPlugins} returns the real ones. Each member mirrors the Capacitor plugin
 * of the same role; see that plugin's documentation for the exact behaviour of a call.
 */
export interface MobilePlugins {
  /** `'android'` or `'ios'`. */
  platform: 'android' | 'ios';
  /** `@capacitor/filesystem`: the files behind {@link CapacitorFiles}. */
  filesystem: {
    /** Reads a file; `data` is base64 (or a `Blob` on the web implementation). */
    readFile(options: { path: string; directory: string }): Promise<{
      /** The content, base64-encoded. */
      data: string | Blob;
    }>;
    /** Writes base64 `data`, creating parent folders when `recursive`. */
    writeFile(options: {
      path: string;
      data: string;
      directory: string;
      recursive?: boolean;
    }): Promise<unknown>;
    /** Deletes a file; rejects when it does not exist. */
    deleteFile(options: { path: string; directory: string }): Promise<void>;
    /** Lists the entries of a folder. */
    readdir(options: { path: string; directory: string }): Promise<{
      /** The folder's entries. */
      files: {
        /** File or folder name, without the parent path. */
        name: string;
        /** Whether the entry is a file or a folder. */
        type: 'file' | 'directory';
      }[];
    }>;
    /** Moves a file, used for atomic writes. */
    rename(options: { from: string; to: string; directory: string }): Promise<void>;
    /** Native URI of a path, shown to players as the save folder. */
    getUri(options: { path: string; directory: string }): Promise<{
      /** `file://` URI of the path. */
      uri: string;
    }>;
  };
  /** Directory constant of app-private storage (`Directory.Data`). */
  dataDirectory: string;
  /** `capacitor-secure-storage-plugin`: Android Keystore / iOS Keychain strings. */
  secureStorage: {
    /** Reads a stored string; rejects when the key does not exist. */
    get(options: { key: string }): Promise<{
      /** The stored string. */
      value: string;
    }>;
    /** Stores a string under `key`, replacing any previous value. */
    set(options: { key: string; value: string }): Promise<unknown>;
    /** Deletes the entry of `key`. */
    remove(options: { key: string }): Promise<unknown>;
    /** Lists the stored keys. */
    keys(): Promise<{
      /** Every stored key. */
      value: string[];
    }>;
  };
  /** `@capacitor/app`: lifecycle events, app info and launch URL. */
  app: {
    /** Listens to a native event (`backButton`, `pause`, `resume`, `appUrlOpen`). */
    addListener(event: string, listener: (event: never) => void): Promise<ListenerHandle>;
    /** Closes the app (Android). */
    exitApp(): Promise<void>;
    /** Sends the app to the background (Android). */
    minimizeApp(): Promise<void>;
    /** Identity and version of the installed app. */
    getInfo(): Promise<{
      /** Application id, e.g. `com.example.game`. */
      id: string;
      /** Display name. */
      name: string;
      /** Version name, e.g. `1.2.0`. */
      version: string;
      /** Build number (Android `versionCode`, iOS `CFBundleVersion`). */
      build: string;
    }>;
    /** The link the app was launched with, if any. */
    getLaunchUrl(): Promise<
      | {
          /** The launch link. */
          url: string;
        }
      | undefined
    >;
  };
  /** `@capacitor/haptics`: vibration feedback. */
  haptics: {
    /** A physical tap of the given style (`ImpactStyle`). */
    impact(options: { style: string }): Promise<void>;
    /** A success, warning or error pattern (`NotificationType`). */
    notification(options: { type: string }): Promise<void>;
    /** Vibrates for `duration` ms. */
    vibrate(options: { duration: number }): Promise<void>;
    /** Starts a selection feedback sequence. */
    selectionStart(): Promise<void>;
    /** A light tick for a selection change. */
    selectionChanged(): Promise<void>;
    /** Ends a selection feedback sequence. */
    selectionEnd(): Promise<void>;
  };
  /** `@capacitor-community/keep-awake`: keeps the screen on while playing. */
  keepAwake: {
    /** Keeps the screen on. */
    keepAwake(): Promise<void>;
    /** Lets the screen turn off again. */
    allowSleep(): Promise<void>;
  };
  /** `@capacitor/screen-orientation`: locks the screen orientation. */
  screenOrientation: {
    /** Locks the screen to landscape or portrait. */
    lock(options: { orientation: 'landscape' | 'portrait' }): Promise<void>;
    /** Lets the screen rotate again. */
    unlock(): Promise<void>;
  };
  /** Capacitor's `SystemBars`: status and navigation bars. */
  systemBars: {
    /** Hides the system bars (immersive mode). */
    hide(options?: object): Promise<void>;
    /** Shows the system bars again. */
    show(options?: object): Promise<void>;
  };
  /** `@capacitor/browser`: opens links outside the game. */
  browser: {
    /** Opens `url` in the system browser or an in-app browser tab. */
    open(options: { url: string }): Promise<void>;
  };
  /** `@capacitor-community/sqlite`: the databases behind the `sqlite` native module. */
  sqlite: {
    /** Creates the native connection of a database (before {@link MobilePlugins.sqlite.open}). */
    createConnection(options: {
      database: string;
      version: number;
      encrypted: boolean;
      mode: string;
      readonly: boolean;
    }): Promise<void>;
    /** Drops native connections the page no longer knows (after a WebView reload). */
    checkConnectionsConsistency(options: {
      dbNames: string[];
      openModes: string[];
    }): Promise<unknown>;
    /** Opens a database whose connection exists. */
    open(options: { database: string; readonly: boolean }): Promise<void>;
    /** Closes an open database. */
    close(options: { database: string; readonly: boolean }): Promise<void>;
    /** Removes the native connection of a closed database. */
    closeConnection(options: { database: string; readonly: boolean }): Promise<void>;
    /** Runs one or more statements without parameters. */
    execute(options: {
      database: string;
      statements: string;
      transaction: boolean;
      readonly: boolean;
    }): Promise<{
      /** What the statements changed. */
      changes?: {
        /** Rows inserted, updated or deleted. */
        changes?: number;
        /** Row id of the last insert. */
        lastId?: number;
      };
    }>;
    /** Runs one statement with bound parameters. */
    run(options: {
      database: string;
      statement: string;
      values: unknown[];
      transaction: boolean;
      readonly: boolean;
    }): Promise<{
      /** What the statement changed. */
      changes?: {
        /** Rows inserted, updated or deleted. */
        changes?: number;
        /** Row id of the last insert. */
        lastId?: number;
      };
    }>;
    /** Runs a query and returns its rows. */
    query(options: {
      database: string;
      statement: string;
      values: unknown[];
      readonly: boolean;
    }): Promise<{
      /** Rows keyed by column name (iOS adds a first row of column names). */
      values?: Record<string, unknown>[];
    }>;
  };
  /** The engine's own plugin (Game Center on iOS, Play Games Services on Android). */
  games: GamesPlugin;
  /** Capacitor plugin by name, for native modules registered by games. */
  plugin(name: string): Record<string, (options?: object) => Promise<unknown>> | undefined;
}

/** `BlacklightGames`: the native plugin shipped in `@blacklight/mobile` (android/, ios/). */
export interface GamesPlugin {
  /** Signs the player in to Game Center or Play Games, showing the system sign-in when needed. */
  signIn(): Promise<{
    /** Whether a player is signed in. */
    authenticated: boolean;
    /** The service's player id, when signed in. */
    playerId?: string;
    /** The player's display name, when signed in. */
    displayName?: string;
  }>;
  /** Unlocks the achievement `id`. */
  unlock(options: { id: string }): Promise<void>;
  /** Reports progress of an incremental achievement (`current` out of `total`). */
  progress(options: { id: string; current: number; total: number }): Promise<void>;
  /** Shows the system achievements screen. */
  show(): Promise<void>;
  /** Submits `score` to the leaderboard `board`. */
  submitScore(options: { board: string; score: number }): Promise<void>;
  /** Reads the top `limit` entries of the all-time public leaderboard `board`. */
  scores(options: { board: string; limit: number }): Promise<{
    /** Rows from the best score down. */
    entries: {
      /** 1-based rank on the board. */
      rank: number;
      /** Player display name. */
      name: string;
      /** Submitted score. */
      score: number;
    }[];
  }>;
}

/** Haptic styles accepted by `invoke('haptics', 'impact', style)`. */
export const IMPACT_STYLES: Record<string, string> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/** Notification kinds accepted by `invoke('haptics', 'notification', type)`. */
export const NOTIFICATION_TYPES: Record<string, string> = {
  success: NotificationType.Success,
  warning: NotificationType.Warning,
  error: NotificationType.Error,
};

let games: GamesPlugin | undefined;

/**
 * The real Capacitor plugins. Call it only inside the app (`Capacitor.isNativePlatform()`).
 *
 * @example
 * ```ts
 * const platform = new MobilePlatform(capacitorPlugins());
 * ```
 */
export function capacitorPlugins(): MobilePlugins {
  games ??= registerPlugin<GamesPlugin>('BlacklightGames');
  return {
    platform: Capacitor.getPlatform() === 'ios' ? 'ios' : 'android',
    filesystem: Filesystem as unknown as MobilePlugins['filesystem'],
    dataDirectory: Directory.Data,
    secureStorage: SecureStoragePlugin,
    app: App as unknown as MobilePlugins['app'],
    haptics: Haptics as unknown as MobilePlugins['haptics'],
    keepAwake: KeepAwake,
    screenOrientation: ScreenOrientation,
    systemBars: {
      hide: () => SystemBars.hide(),
      show: () => SystemBars.show(),
    },
    browser: Browser,
    sqlite: CapacitorSQLite as unknown as MobilePlugins['sqlite'],
    games,
    plugin: (name) =>
      Capacitor.isPluginAvailable(name)
        ? ((Capacitor as unknown as { Plugins: Record<string, unknown> }).Plugins[name] as Record<
            string,
            (o?: object) => Promise<unknown>
          >)
        : undefined,
  };
}

/**
 * `true` inside the Android or iOS app, `false` in a browser. Use it to skip phone-only features
 * when the same bundle runs on the web.
 *
 * @example
 * ```ts
 * import { isNativeApp } from '@blacklight/mobile';
 *
 * if (isNativeApp()) await this.game.platform.invoke('haptics', 'impact', 'light');
 * ```
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
