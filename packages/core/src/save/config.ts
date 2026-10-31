/**
 * Data a game keeps in its saves (`game.save.data`). Add your fields by augmenting the interface:
 *
 * @example
 * ```ts
 * declare module '@blacklight/core' {
 *   interface SaveData {
 *     gold: number;
 *     party: string[];
 *   }
 * }
 * ```
 */
export interface SaveData {
  [key: string]: unknown;
}

/** Turns data saved by the previous format version into the next one. */
export type SaveMigration = (data: Record<string, unknown>) => Record<string, unknown>;

/** Folder overrides per desktop OS. `~` and `%VAR%` / `$VAR` environment variables are expanded. */
export interface SaveLocation {
  /** Save folder on Windows. */
  windows?: string;
  /** Save folder on macOS. */
  mac?: string;
  /** Save folder on Linux. */
  linux?: string;
}

/**
 * `save` in `game.config.ts`.
 *
 * @example
 * ```ts
 * save: {
 *   slots: 3,
 *   autosave: { interval: 300, onSceneChange: true },
 *   version: 2,
 *   migrations: { 2: (data) => ({ ...data, gems: 0 }) },
 * }
 * ```
 */
export interface SaveConfig {
  /** Manual slots, numbered from 1. `'auto'` and named slots come on top. @defaultValue `10` */
  slots?: number;
  /**
   * Writes the `'auto'` slot on its own: `true` saves on every scene change; `interval` (seconds of
   * play) saves periodically. @defaultValue `false`
   */
  autosave?:
    | boolean
    | {
        /** Seconds of play between autosaves; `0` turns periodic saves off. @defaultValue `0` */
        interval?: number;
        /** Save when the scene changes. @defaultValue `false` */
        onSceneChange?: boolean;
      };
  /** AES-256-GCM with the per-install key. @defaultValue `true` in release builds, `false` in dev */
  encryption?: boolean;
  /** HMAC-SHA-256 over the whole file; plain files are refused. @defaultValue same as `encryption` */
  integrity?: boolean;
  /** Current format version of `save.data`. @defaultValue `1` */
  version?: number;
  /** `migrations[n]` turns version `n - 1` data into version `n`. */
  migrations?: Record<number, SaveMigration>;
  /**
   * Save folder on desktop. Default: `%APPDATA%\<id>`, `~/Library/Application Support/<id>`,
   * `$XDG_DATA_HOME/<id>` (`~/.local/share/<id>`). Mobile uses app storage, the web IndexedDB.
   */
  location?: string | SaveLocation;
}

/** {@link SaveConfig} with every default applied for this build. */
export interface ResolvedSaveConfig {
  /** Number of manual slots. */
  slots: number;
  /** When the `'auto'` slot is written. */
  autosave: {
    /** Seconds of play between autosaves; `0` when periodic saves are off. */
    interval: number;
    /** Whether a scene change saves. */
    onSceneChange: boolean;
  };
  /** Whether save files are encrypted. */
  encryption: boolean;
  /** Whether save files are signed and unsigned files refused. */
  integrity: boolean;
  /** Current format version of `save.data`. */
  version: number;
  /** Migrations by target version. */
  migrations: Record<number, SaveMigration>;
  /** Save folder override on desktop, `undefined` for the OS default. */
  location: string | SaveLocation | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks `save` from `game.config.ts`; returns one readable line per problem (empty when valid).
 * `resolveConfig` calls it with the rest of the configuration.
 *
 * @example
 * ```ts
 * import { validateSaveConfig } from '@blacklight/core';
 *
 * validateSaveConfig({ slots: 0 }); // ['`save.slots` must be a positive integer, e.g. `slots: 3`']
 * ```
 */
export function validateSaveConfig(save: unknown): string[] {
  if (save === undefined) return [];
  if (!isRecord(save)) return ['`save` must be an object, e.g. `save: { slots: 3 }`'];
  const issues: string[] = [];
  const { slots, autosave, encryption, integrity, version, migrations, location } = save;
  if (slots !== undefined && (!Number.isInteger(slots) || (slots as number) < 1)) {
    issues.push('`save.slots` must be a positive integer, e.g. `slots: 3`');
  }
  if (autosave !== undefined && typeof autosave !== 'boolean') {
    if (!isRecord(autosave)) {
      issues.push(
        '`save.autosave` must be a boolean or `{ interval?: seconds, onSceneChange?: boolean }`',
      );
    } else {
      if (
        autosave.interval !== undefined &&
        (typeof autosave.interval !== 'number' || autosave.interval < 0)
      ) {
        issues.push('`save.autosave.interval` must be a number of seconds (0 turns it off)');
      }
      if (autosave.onSceneChange !== undefined && typeof autosave.onSceneChange !== 'boolean') {
        issues.push('`save.autosave.onSceneChange` must be a boolean');
      }
    }
  }
  if (encryption !== undefined && typeof encryption !== 'boolean') {
    issues.push('`save.encryption` must be a boolean');
  }
  if (integrity !== undefined && typeof integrity !== 'boolean') {
    issues.push('`save.integrity` must be a boolean');
  }
  if (version !== undefined && (!Number.isInteger(version) || (version as number) < 1)) {
    issues.push('`save.version` must be a positive integer, e.g. `version: 2`');
  }
  if (migrations !== undefined) {
    if (!isRecord(migrations)) {
      issues.push(
        '`save.migrations` must map a version to a function, e.g. `{ 2: (data) => data }`',
      );
    } else {
      for (const [key, fn] of Object.entries(migrations)) {
        if (!/^\d+$/.test(key) || Number(key) < 2) {
          issues.push(`\`save.migrations\`: "${key}" must be a version number of 2 or more`);
        } else if (typeof fn !== 'function') {
          issues.push(`\`save.migrations[${key}]\` must be a function \`(data) => newData\``);
        } else if (Number(key) > ((version as number | undefined) ?? 1)) {
          issues.push(
            `\`save.migrations[${key}]\` is above \`save.version\` (${String(version ?? 1)}): raise \`save.version\` to ${key}`,
          );
        }
      }
    }
  }
  if (location !== undefined && typeof location !== 'string') {
    if (!isRecord(location)) {
      issues.push('`save.location` must be a folder path or `{ windows?, mac?, linux? }`');
    } else {
      for (const [os, path] of Object.entries(location)) {
        if (!['windows', 'mac', 'linux'].includes(os)) {
          issues.push(`\`save.location.${os}\` is unknown: use windows, mac or linux`);
        } else if (typeof path !== 'string' || path === '') {
          issues.push(`\`save.location.${os}\` must be a folder path`);
        }
      }
    }
  }
  return issues;
}

/**
 * Applies the defaults. Release builds encrypt and sign saves unless the config says otherwise;
 * dev builds write plain JSON (SV-07).
 *
 * @example
 * ```ts
 * import { resolveSaveConfig } from '@blacklight/core/config';
 *
 * resolveSaveConfig({ slots: 3 }, true).encryption; // true: release builds encrypt
 * resolveSaveConfig({ slots: 3 }, false).encryption; // false: dev builds write plain JSON
 * ```
 */
export function resolveSaveConfig(
  save: SaveConfig | undefined,
  release: boolean,
): ResolvedSaveConfig {
  const autosave = save?.autosave;
  const encryption = save?.encryption ?? release;
  return {
    slots: save?.slots ?? 10,
    autosave:
      autosave === true
        ? { interval: 0, onSceneChange: true }
        : autosave
          ? { interval: autosave.interval ?? 0, onSceneChange: autosave.onSceneChange ?? false }
          : { interval: 0, onSceneChange: false },
    encryption,
    integrity: save?.integrity ?? (save?.encryption === undefined ? release : encryption),
    version: save?.version ?? 1,
    migrations: save?.migrations ?? {},
    location: save?.location,
  };
}
