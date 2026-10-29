// Test platforms shared by the module tests.
import { WebPlatform, type Platform } from '@blacklight/core';

/** A desktop platform as the tests drive it. */
export interface DesktopPlatform extends Platform {
  /** The OS keystore behind `secure-storage`. */
  keystore: Map<string, string>;
  /** URLs opened in the "system browser". */
  opened: string[];
  /** Answers other native modules (`steam`…); return `undefined` to refuse. */
  natives: Record<string, (method: string, ...args: unknown[]) => unknown>;
  /** Raises a platform event (`deeplink`, `resume`…). */
  emit(event: string, payload?: unknown): void;
}

/**
 * A desktop platform: secure storage in a map (the OS keystore), and a "system browser" that
 * follows the provider's redirect and hands the custom-scheme URL back as a `deeplink` event,
 * like Electron's protocol handler.
 */
export function desktop(
  gameId: string,
  options: { keystore?: Map<string, string>; files?: WebPlatform; steam?: boolean } = {},
): DesktopPlatform {
  const web = options.files ?? new WebPlatform(gameId);
  const keystore = options.keystore ?? new Map<string, string>();
  const platform = Object.create(web) as DesktopPlatform;
  return Object.assign(platform, {
    name: 'desktop' as const,
    steam: options.steam ?? false,
    keystore,
    opened: [] as string[],
    natives: {},
    emit: (event: string, payload?: unknown) => web.emit(event, payload),
    async invoke(module: string, method: string, ...args: unknown[]) {
      if (module === 'secure-storage') {
        const [key, value] = args as [string, string | undefined];
        if (method === 'get') return keystore.get(key) ?? null;
        if (method === 'set') return void keystore.set(key, value!);
        if (method === 'remove') return void keystore.delete(key);
      }
      const native = platform.natives[module];
      if (native) return native(method, ...args);
      throw new Error(`no native module ${module}.${method}`);
    },
    async openUrl(url: string) {
      platform.opened.push(url);
      const response = await fetch(url, { redirect: 'manual' });
      const location = response.headers.get('location');
      if (location) setTimeout(() => web.emit('deeplink', location), 5);
    },
  });
}
