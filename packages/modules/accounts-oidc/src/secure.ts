import type { Platform } from '@blacklight/core';

/** Secrets kept by the OS keystore (desktop, mobile) or encrypted on the device (web). */
export interface SecureStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * The platform's secure storage: `platform.invoke('secure-storage', 'get' | 'set' | 'remove', key,
 * value?)` on desktop (Electron safeStorage) and mobile (Keychain, Android Keystore). Browsers have
 * no keystore: values are encrypted with the platform's non-extractable per-install key and
 * stored in the game's files, so scripts on the page can use them but no tool can copy them out
 * as plain text.
 */
export function secureStore(platform: Platform, prefix: string): SecureStore {
  if (platform.name !== 'web') {
    return {
      async get(key) {
        const value = await platform.invoke<string | null | undefined>(
          'secure-storage',
          'get',
          `${prefix}.${key}`,
        );
        return value ?? undefined;
      },
      async set(key, value) {
        await platform.invoke('secure-storage', 'set', `${prefix}.${key}`, value);
      },
      async remove(key) {
        await platform.invoke('secure-storage', 'remove', `${prefix}.${key}`);
      },
    };
  }
  const file = (key: string) => `secure/${prefix}.${key}.bin`;
  return {
    async get(key) {
      const data = await platform.files.read(file(key));
      if (!data || data.length < 13) return undefined;
      try {
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: data.slice(0, 12) },
          await platform.saveKey(),
          data.slice(12),
        );
        return new TextDecoder().decode(plain);
      } catch {
        // Another install's key (copied browser profile): the secret is gone, sign in again.
        return undefined;
      }
    },
    async set(key, value) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await platform.saveKey(),
        new TextEncoder().encode(value),
      );
      const out = new Uint8Array(12 + sealed.byteLength);
      out.set(iv);
      out.set(new Uint8Array(sealed), 12);
      await platform.files.write(file(key), out);
    },
    async remove(key) {
      await platform.files.remove(file(key));
    },
  };
}
