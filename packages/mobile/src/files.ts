import type { PlatformFiles } from '@blacklight/core';
import type { MobilePlugins } from './plugins';

/** Folder inside app-private storage that holds the game's files. */
export const FILES_ROOT = 'blacklight';

const TEMP_SUFFIX = '.tmp';

/** @internal Converts bytes to base64 (the format Capacitor's bridge carries binary data in). */
export function toBase64(data: Uint8Array): string {
  let binary = '';
  // Chunks keep `String.fromCharCode` under the engines' argument limits.
  for (let i = 0; i < data.length; i += 0x8000) {
    binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** @internal Converts base64 back to bytes (the bridge's binary format). */
export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * @internal `true` for the "file does not exist" error of `@capacitor/filesystem` on Android and
 * iOS; {@link CapacitorFiles} turns it into `undefined`.
 */
export function isNotFound(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return (
    code === 'OS-PLUG-FILE-0008' ||
    /does not exist|not found|no such file|doesn.t exist/i.test(String(message ?? ''))
  );
}

function checkPath(path: string): string {
  if (
    typeof path !== 'string' ||
    path === '' ||
    path.startsWith('/') ||
    /(^|\/)\.\.?(\/|$)/.test(path)
  ) {
    throw new Error(
      `Invalid file path "${String(path)}": use a relative path with "/" separators and no "." or ".." parts, e.g. "saves/slot-1.sav".`,
    );
  }
  if (path.endsWith(TEMP_SUFFIX)) {
    throw new Error(
      `File names ending in "${TEMP_SUFFIX}" are reserved for atomic writes: rename "${path}".`,
    );
  }
  return path;
}

/**
 * Files in app-private storage (`Directory.Data`: the app's `files/` folder on Android, its
 * Documents folder on iOS), under `blacklight/`. Writes go to a temporary file renamed over the
 * target, so a crash mid-write leaves either the old or the new file; a leftover temporary file
 * is promoted on the next read. Games reach it as `game.platform.files` on Android and iOS.
 *
 * @example
 * ```ts
 * const files = this.game.platform.files;
 * await files.write('replays/last.bin', new Uint8Array([1, 2, 3]));
 * const replay = await files.read('replays/last.bin'); // Uint8Array, or undefined if missing
 * ```
 */
export class CapacitorFiles implements PlatformFiles {
  private uri: string | undefined;

  constructor(private readonly plugins: Pick<MobilePlugins, 'filesystem' | 'dataDirectory'>) {}

  /** Native folder (`file:///data/user/0/<id>/files/blacklight`), known after {@link init}. */
  get location(): string | undefined {
    return this.uri;
  }

  /** Resolves {@link location}. */
  async init(): Promise<void> {
    try {
      const { uri } = await this.fs.getUri({ path: FILES_ROOT, directory: this.dir });
      // Android reports folders with a trailing slash, iOS without.
      this.uri = uri.replace(/\/+$/, '');
    } catch {
      // Only used for display; files work without it.
    }
  }

  private get fs(): MobilePlugins['filesystem'] {
    return this.plugins.filesystem;
  }

  private get dir(): string {
    return this.plugins.dataDirectory;
  }

  private full(path: string): string {
    return `${FILES_ROOT}/${path}`;
  }

  private async readRaw(full: string): Promise<Uint8Array | undefined> {
    try {
      const { data } = await this.fs.readFile({ path: full, directory: this.dir });
      if (typeof data === 'string') return fromBase64(data);
      return new Uint8Array(await data.arrayBuffer());
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  /**
   * Reads the file at `path` (relative, `/`-separated), or `undefined` when it does not exist.
   *
   * @throws Error when `path` is absolute, contains `.` or `..` parts or ends in `.tmp`.
   */
  async read(path: string): Promise<Uint8Array | undefined> {
    const full = this.full(checkPath(path));
    const data = await this.readRaw(full);
    if (data) return data;
    // The app stopped between the temporary write and the rename: the temporary file is complete.
    const pending = await this.readRaw(full + TEMP_SUFFIX);
    if (pending) await this.promote(full);
    return pending;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const full = this.full(checkPath(path));
    await this.fs.writeFile({
      path: full + TEMP_SUFFIX,
      data: toBase64(data),
      directory: this.dir,
      recursive: true,
    });
    await this.promote(full);
  }

  private async promote(full: string): Promise<void> {
    try {
      await this.fs.rename({ from: full + TEMP_SUFFIX, to: full, directory: this.dir });
    } catch (error) {
      // iOS refuses to move over an existing file: delete the old one, then retry. The complete
      // new file stays in the temporary file meanwhile, so nothing is lost if the app stops here.
      await this.removeIfPresent(full);
      try {
        await this.fs.rename({ from: full + TEMP_SUFFIX, to: full, directory: this.dir });
      } catch {
        throw error;
      }
    }
  }

  private async removeIfPresent(full: string): Promise<void> {
    try {
      await this.fs.deleteFile({ path: full, directory: this.dir });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  /** Deletes the file at `path` and any leftover temporary file; a missing file is not an error. */
  async remove(path: string): Promise<void> {
    const full = this.full(checkPath(path));
    await this.removeIfPresent(full);
    await this.removeIfPresent(full + TEMP_SUFFIX);
  }

  async list(prefix = ''): Promise<string[]> {
    const found = new Set<string>();
    const walk = async (dir: string, relative: string): Promise<void> => {
      let entries: { name: string; type: 'file' | 'directory' }[];
      try {
        entries = (await this.fs.readdir({ path: dir, directory: this.dir })).files;
      } catch (error) {
        if (isNotFound(error)) return;
        throw error;
      }
      for (const entry of entries) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.type === 'directory') await walk(`${dir}/${entry.name}`, path);
        else found.add(path.endsWith(TEMP_SUFFIX) ? path.slice(0, -TEMP_SUFFIX.length) : path);
      }
    };
    await walk(FILES_ROOT, '');
    return [...found].filter((path) => path.startsWith(prefix)).sort();
  }
}
