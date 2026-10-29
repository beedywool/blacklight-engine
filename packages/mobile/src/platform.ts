import type { Platform, PlatformName, Unsubscribe } from '@blacklight/core';
import { CapacitorFiles, fromBase64, toBase64 } from './files';
import {
  RESERVED_PREFIX,
  appModule,
  gamesModule,
  hapticsModule,
  secureStorageModule,
  sqliteModule,
  type NativeModule,
} from './modules';
import type { MobilePlugins } from './plugins';

/** Secure-storage entry holding the save key. */
export const SAVE_KEY_ENTRY = `${RESERVED_PREFIX}saveKey`;

/** Events {@link MobilePlatform} raises, with their payloads. */
export interface MobileEvents {
  /** Android back button or back gesture. */
  back: undefined;
  /** The app went to the background. */
  pause: undefined;
  /** The app came back to the foreground. */
  resume: undefined;
  /** The app was opened by a link (custom scheme or app link), at launch or while running. */
  deeplink: { url: string };
}

/**
 * The Android and iOS platform: files in app-private storage with atomic writes, the save key in
 * the Keystore/Keychain, native modules through Capacitor plugins, and the app's lifecycle as
 * events. Installed by the {@link mobile} game plugin; games reach it as `game.platform`.
 *
 * @example
 * ```ts
 * await this.game.platform.invoke('haptics', 'impact', 'heavy');
 * this.game.platform.on('pause', () => this.save());
 * ```
 */
export class MobilePlatform implements Platform {
  readonly name: PlatformName;
  readonly steam = false;
  readonly files: CapacitorFiles;
  private readonly modules = new Map<string, NativeModule>();
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  /** Deep links that arrived before anyone listened (the link that launched the app). */
  private readonly pendingLinks: { url: string }[] = [];
  private key: Promise<CryptoKey> | undefined;
  private readonly handles: Promise<{ remove(): Promise<void> }>[] = [];

  constructor(private readonly plugins: MobilePlugins) {
    this.name = plugins.platform;
    this.files = new CapacitorFiles(plugins);
    this.modules.set('secure-storage', secureStorageModule(plugins));
    this.modules.set('sqlite', sqliteModule(plugins));
    this.modules.set('haptics', hapticsModule(plugins));
    this.modules.set('app', appModule(plugins));
    this.modules.set('gamecenter', gamesModule(plugins, 'gamecenter'));
    this.modules.set('playgames', gamesModule(plugins, 'playgames'));
  }

  /** Connects the native events and resolves `files.location`. Called once by the plugin. */
  async init(): Promise<void> {
    const { app } = this.plugins;
    this.handles.push(
      app.addListener('backButton', () => this.emit('back')),
      app.addListener('pause', () => this.emit('pause')),
      app.addListener('resume', () => this.emit('resume')),
      app.addListener('appUrlOpen', ((event: { url: string }) =>
        this.emit('deeplink', { url: event.url })) as (event: never) => void),
    );
    await Promise.all(this.handles);
    await this.files.init();
    const launch = await app.getLaunchUrl().catch(() => undefined);
    if (launch?.url) this.emit('deeplink', { url: launch.url });
  }

  /** Removes the native listeners. */
  async dispose(): Promise<void> {
    await Promise.all(this.handles.map(async (handle) => (await handle).remove()));
    this.handles.length = 0;
  }

  saveKey(): Promise<CryptoKey> {
    this.key ??= this.loadKey().catch((error: unknown) => {
      this.key = undefined;
      throw error;
    });
    return this.key;
  }

  private async loadKey(): Promise<CryptoKey> {
    const store = this.plugins.secureStorage;
    const { value: keys } = await store.keys();
    let raw: Uint8Array<ArrayBuffer>;
    if (keys.includes(SAVE_KEY_ENTRY)) {
      // A read error must not fall through to a new key: the saves made with the old one would
      // become unreadable.
      raw = fromBase64((await store.get({ key: SAVE_KEY_ENTRY })).value) as Uint8Array<ArrayBuffer>;
      if (raw.length !== 32) {
        throw new Error(
          `The save key in the ${this.keystore} is ${raw.length} bytes instead of 32. Reinstall the app to start over (saves made with the damaged key cannot be read).`,
        );
      }
    } else {
      raw = crypto.getRandomValues(new Uint8Array(32));
      await store.set({ key: SAVE_KEY_ENTRY, value: toBase64(raw) });
    }
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
    raw.fill(0);
    return key;
  }

  private get keystore(): string {
    return this.name === 'ios' ? 'iOS Keychain' : 'Android Keystore';
  }

  /**
   * Adds a native module answered in JavaScript (for example a wrapper around a third-party
   * Capacitor plugin). Built-in names cannot be replaced.
   *
   * @example
   * ```ts
   * platform.register('share', { text: (value) => Share.share({ text: String(value) }) });
   * ```
   */
  register(module: string, implementation: NativeModule): void {
    if (BUILT_IN.includes(module)) {
      throw new Error(
        `"${module}" is a built-in native module of @blacklight/mobile; register yours under another name.`,
      );
    }
    this.modules.set(module, implementation);
  }

  async invoke<T = unknown>(module: string, method: string, ...args: unknown[]): Promise<T> {
    const known = this.modules.get(module);
    if (known) {
      const fn = known[method];
      if (typeof fn !== 'function' || !Object.hasOwn(known, method)) {
        throw new Error(
          `"${module}" has no method "${method}" on ${this.name}. Available: ${Object.keys(known).join(', ')}.`,
        );
      }
      return (await fn(...args)) as T;
    }
    // A Capacitor plugin of the same name (the mobile side of a module made with defineNative):
    // arguments travel as `{ args }`, the result comes back as `{ value }`.
    const plugin = this.plugins.plugin(module);
    if (!plugin) {
      throw new Error(
        `No native module "${module}" on ${this.name}. Built-in modules: ${BUILT_IN.join(', ')}; other names need a Capacitor plugin called "${module}" in the app, or platform.register("${module}", …).`,
      );
    }
    const result = (await plugin[method]!({ args })) as { value?: unknown } | undefined;
    return (result && typeof result === 'object' && 'value' in result ? result.value : result) as T;
  }

  on(event: string, listener: (payload: unknown) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    if (event === 'deeplink') {
      for (const link of this.pendingLinks.splice(0)) listener(link);
    }
    return () => set.delete(listener);
  }

  /** Raises an event, as the native side does (tests, custom plugins). */
  emit<K extends keyof MobileEvents>(event: K, payload?: MobileEvents[K]): void {
    const set = this.listeners.get(event);
    if (event === 'deeplink' && (!set || set.size === 0)) {
      this.pendingLinks.push(payload as { url: string });
      return;
    }
    for (const listener of set ?? []) listener(payload);
  }

  async openUrl(url: string): Promise<void> {
    if (!/^https?:\/\//.test(url)) {
      throw new Error(`openUrl() opens http(s) links in the system browser; "${url}" is not one.`);
    }
    await this.plugins.browser.open({ url });
  }

  quit(): void {
    // Apple's review rejects apps that close themselves, so on iOS this does nothing.
    if (this.name === 'android') void this.plugins.app.exitApp();
  }
}

/** Native modules {@link MobilePlatform} answers itself. */
export const BUILT_IN = ['secure-storage', 'sqlite', 'haptics', 'app', 'gamecenter', 'playgames'];
