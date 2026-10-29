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
  remove(): Promise<void>;
}

/**
 * The Capacitor plugins the mobile platform talks to, reduced to the calls it makes. Tests pass
 * fakes; {@link capacitorPlugins} returns the real ones.
 */
export interface MobilePlugins {
  /** `'android'` or `'ios'`. */
  platform: 'android' | 'ios';
  filesystem: {
    readFile(options: { path: string; directory: string }): Promise<{ data: string | Blob }>;
    writeFile(options: {
      path: string;
      data: string;
      directory: string;
      recursive?: boolean;
    }): Promise<unknown>;
    deleteFile(options: { path: string; directory: string }): Promise<void>;
    readdir(options: {
      path: string;
      directory: string;
    }): Promise<{ files: { name: string; type: 'file' | 'directory' }[] }>;
    rename(options: { from: string; to: string; directory: string }): Promise<void>;
    getUri(options: { path: string; directory: string }): Promise<{ uri: string }>;
  };
  /** Directory constant of app-private storage (`Directory.Data`). */
  dataDirectory: string;
  secureStorage: {
    get(options: { key: string }): Promise<{ value: string }>;
    set(options: { key: string; value: string }): Promise<unknown>;
    remove(options: { key: string }): Promise<unknown>;
    keys(): Promise<{ value: string[] }>;
  };
  app: {
    addListener(event: string, listener: (event: never) => void): Promise<ListenerHandle>;
    exitApp(): Promise<void>;
    minimizeApp(): Promise<void>;
    getInfo(): Promise<{ id: string; name: string; version: string; build: string }>;
    getLaunchUrl(): Promise<{ url: string } | undefined>;
  };
  haptics: {
    impact(options: { style: string }): Promise<void>;
    notification(options: { type: string }): Promise<void>;
    vibrate(options: { duration: number }): Promise<void>;
    selectionStart(): Promise<void>;
    selectionChanged(): Promise<void>;
    selectionEnd(): Promise<void>;
  };
  keepAwake: { keepAwake(): Promise<void>; allowSleep(): Promise<void> };
  screenOrientation: {
    lock(options: { orientation: 'landscape' | 'portrait' }): Promise<void>;
    unlock(): Promise<void>;
  };
  systemBars: { hide(options?: object): Promise<void>; show(options?: object): Promise<void> };
  browser: { open(options: { url: string }): Promise<void> };
  sqlite: {
    createConnection(options: {
      database: string;
      version: number;
      encrypted: boolean;
      mode: string;
      readonly: boolean;
    }): Promise<void>;
    checkConnectionsConsistency(options: {
      dbNames: string[];
      openModes: string[];
    }): Promise<unknown>;
    open(options: { database: string; readonly: boolean }): Promise<void>;
    close(options: { database: string; readonly: boolean }): Promise<void>;
    closeConnection(options: { database: string; readonly: boolean }): Promise<void>;
    execute(options: {
      database: string;
      statements: string;
      transaction: boolean;
      readonly: boolean;
    }): Promise<{ changes?: { changes?: number; lastId?: number } }>;
    run(options: {
      database: string;
      statement: string;
      values: unknown[];
      transaction: boolean;
      readonly: boolean;
    }): Promise<{ changes?: { changes?: number; lastId?: number } }>;
    query(options: {
      database: string;
      statement: string;
      values: unknown[];
      readonly: boolean;
    }): Promise<{ values?: Record<string, unknown>[] }>;
  };
  /** The engine's own plugin (Game Center on iOS, Play Games Services on Android). */
  games: GamesPlugin;
  /** Capacitor plugin by name, for native modules registered by games. */
  plugin(name: string): Record<string, (options?: object) => Promise<unknown>> | undefined;
}

/** `BlacklightGames`: the native plugin shipped in `@blacklight/mobile` (android/, ios/). */
export interface GamesPlugin {
  signIn(): Promise<{ authenticated: boolean; playerId?: string; displayName?: string }>;
  unlock(options: { id: string }): Promise<void>;
  progress(options: { id: string; current: number; total: number }): Promise<void>;
  show(): Promise<void>;
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

/** `true` inside the Android or iOS app, `false` in a browser. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
