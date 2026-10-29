import { EventBus, type Platform, type PlatformFiles, type Unsubscribe } from '@blacklight/core';
import type { NativeBridge } from '../bridge';

/**
 * `game.platform` in the desktop app: files in the OS data folder (atomic writes in the main
 * process), the save key from the OS keystore (Electron `safeStorage`), native calls over the IPC
 * bridge. Installed by the {@link desktop} plugin.
 */
export class DesktopPlatform implements Platform {
  readonly name = 'desktop' as const;
  readonly steam: boolean;
  readonly files: PlatformFiles;
  private readonly events = new EventBus<Record<string, unknown>>();
  private key: Promise<CryptoKey> | undefined;
  private linksTaken = false;

  constructor(private readonly bridge: NativeBridge) {
    this.steam = bridge.info.steam;
    bridge.subscribe((event, payload) => this.events.emit(event, payload as never));
    const call = <T>(method: string, ...args: unknown[]) =>
      bridge.invoke('files', method, args) as Promise<T>;
    this.files = {
      location: bridge.info.dataDir,
      read: (path) => call<Uint8Array | undefined>('read', path),
      write: (path, data) => call<void>('write', path, data),
      remove: (path) => call<void>('remove', path),
      list: (prefix) => call<string[]>('list', prefix),
    };
  }

  saveKey(): Promise<CryptoKey> {
    this.key ??= (async () => {
      const raw = (await this.bridge.invoke('keystore', 'saveKey', [])) as Uint8Array;
      try {
        // Non-extractable: game code can use the key, never read it back.
        return await crypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]);
      } finally {
        raw.fill(0);
      }
    })();
    return this.key;
  }

  async invoke<T = unknown>(module: string, method: string, ...args: unknown[]): Promise<T> {
    return (await this.bridge.invoke(module, method, args)) as T;
  }

  on(event: string, listener: (payload: unknown) => void): Unsubscribe {
    const off = this.events.on(event, listener);
    if (event === 'deeplink' && !this.linksTaken) {
      // Links that started the app arrived before anyone listened: the main process kept them.
      this.linksTaken = true;
      void this.bridge.invoke('deeplinks', 'take', []).then(
        (urls) => {
          for (const url of urls as string[]) this.events.emit('deeplink', { url } as never);
        },
        () => undefined,
      );
    }
    return off;
  }

  async openUrl(url: string): Promise<void> {
    await this.bridge.invoke('shell', 'openUrl', [url]);
  }

  quit(): void {
    void this.bridge.invoke('shell', 'quit', []);
  }
}
