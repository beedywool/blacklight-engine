import { EventBus, type Unsubscribe } from './events';

/** Where the game runs. Steam builds are `desktop` with `steam: true`. */
export type PlatformName = 'web' | 'desktop' | 'android' | 'ios';

/**
 * Files in the game's private data folder: the OS standard location on desktop and mobile
 * (`%APPDATA%`, `~/Library/Application Support`, `$XDG_DATA_HOME`, app storage), IndexedDB on the
 * web. Paths are relative and `/`-separated.
 */
export interface PlatformFiles {
  read(path: string): Promise<Uint8Array | undefined>;
  /** Replaces the file atomically (temporary file + rename where the file system allows it). */
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Paths starting with `prefix`. */
  list(prefix?: string): Promise<string[]>;
  /** Human-readable folder (for settings screens and support); `undefined` on the web. */
  readonly location?: string;
}

/**
 * What differs between web, Electron and Capacitor. `game.platform` is the web platform unless a
 * platform package (`@blacklight/native`, `@blacklight/mobile`) installs its own as a game plugin.
 *
 * Native module names used with {@link Platform.invoke}, and the package that provides them:
 * `steam` (native: achievements, cloud, rich presence), `discord` (native), `sdl` (native:
 * gamepads), `secure-storage` (native, mobile), `sqlite` (modules: native and mobile parts),
 * `gamecenter` and `playgames` (mobile: achievements), `haptics`, `app` (mobile: lifecycle,
 * orientation, keep awake), `relay` (net: LAN hosting from the desktop app). Modules defined with
 * `defineNative` register their own names.
 */
export interface Platform {
  readonly name: PlatformName;
  /** Started by the Steam client. */
  readonly steam: boolean;
  readonly files: PlatformFiles;
  /**
   * Per-install AES-GCM key for saves, kept by the OS keystore (Electron `safeStorage`, iOS
   * Keychain, Android Keystore) or as a non-extractable WebCrypto key on the web. Created on first
   * use; the same key comes back on later runs.
   */
  saveKey(): Promise<CryptoKey>;
  /** Calls a native function (Electron main process, Capacitor plugin). */
  invoke<T = unknown>(module: string, method: string, ...args: unknown[]): Promise<T>;
  /** Native events: `deeplink`, `back` (Android), `pause` / `resume`, `gamepad`… */
  on(event: string, listener: (payload: unknown) => void): Unsubscribe;
  /** Opens a URL in the system browser. */
  openUrl(url: string): Promise<void>;
  /** Closes the app (desktop and Android); closes the tab when the browser allows it. */
  quit(): void;
}

/** Web implementation of a native module, used when no native side exists. */
export type WebFallback = Record<string, (...args: unknown[]) => unknown>;

const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * The web platform: files and the save key in IndexedDB (in memory when IndexedDB is missing, as
 * in tests), native calls answered by registered web fallbacks.
 */
export class WebPlatform implements Platform {
  readonly name: PlatformName = 'web';
  readonly steam = false;
  readonly files: PlatformFiles;
  private readonly events = new EventBus<Record<string, unknown>>();
  private readonly fallbacks = new Map<string, WebFallback>();
  private db: Promise<IDBDatabase> | undefined;
  private readonly memory = new Map<string, Uint8Array>();
  private memoryKey: CryptoKey | undefined;

  constructor(private readonly gameId: string) {
    const store = () => this.store('files');
    this.files = {
      read: async (path) => {
        const s = await store();
        if (!s) return this.memory.get(path);
        const value = await request(s('readonly').get(path));
        return value === undefined ? undefined : new Uint8Array(value as ArrayBuffer);
      },
      write: async (path, data) => {
        const s = await store();
        if (!s) return void this.memory.set(path, data.slice());
        await request(s('readwrite').put(data.slice().buffer, path));
      },
      remove: async (path) => {
        const s = await store();
        if (!s) return void this.memory.delete(path);
        await request(s('readwrite').delete(path));
      },
      list: async (prefix = '') => {
        const s = await store();
        const keys = s
          ? ((await request(s('readonly').getAllKeys())) as string[])
          : [...this.memory.keys()];
        return keys.filter((k) => k.startsWith(prefix)).sort();
      },
    };
  }

  private open(): Promise<IDBDatabase> | undefined {
    if (typeof indexedDB === 'undefined') return undefined;
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(`blacklight:${this.gameId}`, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('files');
        req.result.createObjectStore('keys');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  private async store(
    name: 'files' | 'keys',
  ): Promise<((mode: IDBTransactionMode) => IDBObjectStore) | undefined> {
    const db = await this.open();
    return db && ((mode) => db.transaction(name, mode).objectStore(name));
  }

  async saveKey(): Promise<CryptoKey> {
    const store = await this.store('keys');
    if (!store) {
      this.memoryKey ??= await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
        'decrypt',
      ]);
      return this.memoryKey;
    }
    const existing = (await request(store('readonly').get('save'))) as CryptoKey | undefined;
    if (existing) return existing;
    // Non-extractable: scripts can use the key but never read its bytes.
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await request(store('readwrite').put(key, 'save'));
    return key;
  }

  /** Answers `invoke(module, …)` on the web (for modules with a browser implementation). */
  registerFallback(module: string, implementation: WebFallback): void {
    this.fallbacks.set(module, implementation);
  }

  async invoke<T = unknown>(module: string, method: string, ...args: unknown[]): Promise<T> {
    const fn = this.fallbacks.get(module)?.[method];
    if (!fn) {
      throw new Error(
        `"${module}.${method}" is not available on the web: it needs the desktop or mobile app.`,
      );
    }
    return (await fn(...args)) as T;
  }

  on(event: string, listener: (payload: unknown) => void): Unsubscribe {
    return this.events.on(event, listener);
  }

  /** @internal Lets web code raise platform events (tests, fallbacks). */
  emit(event: string, payload?: unknown): void {
    this.events.emit(event, payload as never);
  }

  async openUrl(url: string): Promise<void> {
    globalThis.open?.(url, '_blank', 'noopener');
  }

  quit(): void {
    globalThis.close?.();
  }
}
