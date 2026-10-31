import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type { SaveLocation } from '@blacklight/core/config';

/**
 * @internal Platform files from the main process: one folder, relative `/` paths, atomic writes.
 * Behind `game.platform.files` in the desktop app.
 */
export interface DataFolder {
  /** Absolute folder all paths are relative to. */
  readonly root: string;
  /** Reads a file, or `undefined` when it does not exist. */
  read(path: string): Promise<Uint8Array | undefined>;
  /** Writes a file atomically, creating parent folders. */
  write(path: string, data: Uint8Array): Promise<void>;
  /** Deletes a file; a missing file is not an error. */
  remove(path: string): Promise<void>;
  /** Paths of the files under `prefix`, sorted. */
  list(prefix?: string): Promise<string[]>;
}

const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._ -]{0,127}$/;

/**
 * @internal Checks a path sent by the page: relative, `/`-separated, no `..`, no drive letters,
 * short segments of safe characters.
 *
 * @throws Error explaining what is wrong.
 */
export function checkRelativePath(path: string): string[] {
  const segments = path.split('/');
  if (
    path.length === 0 ||
    path.length > 512 ||
    segments.some((s) => !SEGMENT.test(s) || s.endsWith('.') || s.endsWith(' '))
  ) {
    throw new Error(
      `Invalid file path "${path}": use a relative path of letters, digits, ".", "-", "_" and spaces separated by "/" (no "..").`,
    );
  }
  return segments;
}

/** @internal Replaces `~`, `%VAR%` and `$VAR` / `${VAR}` in a configured folder. */
export function expandPath(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  return path
    .replace(/^~(?=$|[/\\])/, home)
    .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, name: string) => env[name] ?? '')
    .replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, name: string) => env[name] ?? '');
}

/**
 * @internal The OS standard data folder of a game (SV-02): `%APPDATA%\<id>`, `~/Library/Application
 * Support/<id>`, `$XDG_DATA_HOME/<id>` (default `~/.local/share/<id>`), or the configured folder.
 */
export function defaultDataDir(
  id: string,
  location: string | SaveLocation | undefined,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string {
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
  const configured = typeof location === 'string' ? location : location?.[os];
  if (configured) return resolve(expandPath(configured, env, home));
  if (platform === 'win32') return join(env.APPDATA || join(home, 'AppData', 'Roaming'), id);
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', id);
  return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), id);
}

/**
 * @internal Files in `root`. Writes go to a temporary file in the same folder, are flushed to
 * disk, then renamed over the target: a crash leaves either the old or the new file, never half of
 * one.
 */
export function dataFolder(root: string): DataFolder {
  const absolute = (path: string) => {
    const full = resolve(root, ...checkRelativePath(path));
    // Belt and braces: the segment check already refuses "..".
    if (relative(root, full).startsWith('..')) throw new Error(`"${path}" leaves the data folder.`);
    return full;
  };
  return {
    root,
    async read(path) {
      try {
        return new Uint8Array(await readFile(absolute(path)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      }
    },
    async write(path, data) {
      const target = absolute(path);
      await mkdir(dirname(target), { recursive: true });
      const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
      const handle = await open(temp, 'w', 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await rename(temp, target);
      } catch (error) {
        await rm(temp, { force: true });
        throw error;
      }
    },
    async remove(path) {
      await rm(absolute(path), { force: true });
    },
    async list(prefix = '') {
      const out: string[] = [];
      const walk = async (dir: string) => {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
            const rel = relative(root, full).split(sep).join('/');
            if (rel.startsWith(prefix)) out.push(rel);
          }
        }
      };
      await walk(root);
      return out.sort();
    },
  };
}
