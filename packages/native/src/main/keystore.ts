import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** The part of Electron's `safeStorage` the key store uses. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
}

const ENCRYPTED = 1;
const RAW = 0;

/**
 * The per-install save key (SV-03): 32 random bytes created on first use, stored encrypted by the
 * OS keystore through Electron's `safeStorage` (DPAPI on Windows, Keychain on macOS, libsecret or
 * KWallet on Linux). Kept outside the folder the page can read.
 *
 * Without a keystore (a Linux session with no secret service) the key is stored as is, readable
 * only by the user (mode 600), and a warning is logged.
 */
export async function loadSaveKey(
  file: string,
  storage: SafeStorageLike,
  warn: (message: string) => void = console.warn,
): Promise<Uint8Array> {
  try {
    const stored = await readFile(file);
    const kind = stored[0];
    const body = stored.subarray(1);
    if (kind === ENCRYPTED) return Buffer.from(storage.decryptString(body), 'base64');
    if (kind === RAW && body.length === 32) return new Uint8Array(body);
    throw new Error('unknown key format');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(
        `The save key in ${file} cannot be read (${(error as Error).message}); saves of this install cannot be opened. Restore the file or delete it to start without saves.`,
      );
    }
  }
  const key = randomBytes(32);
  await mkdir(dirname(file), { recursive: true });
  if (storage.isEncryptionAvailable()) {
    const encrypted = storage.encryptString(key.toString('base64'));
    await writeFile(file, Buffer.concat([Buffer.from([ENCRYPTED]), encrypted]), { mode: 0o600 });
  } else {
    warn(
      '[blacklight] No OS keystore available (safeStorage): the save key is stored unencrypted, readable by this user only.',
    );
    await writeFile(file, Buffer.concat([Buffer.from([RAW]), key]), { mode: 0o600 });
  }
  return new Uint8Array(key);
}
