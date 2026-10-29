import { IMPACT_STYLES, NOTIFICATION_TYPES, type MobilePlugins } from './plugins';

/** Functions of one native module, called by `platform.invoke(module, method, ...args)`. */
export type NativeModule = Record<string, (...args: unknown[]) => unknown>;

/** Secure-storage keys the engine keeps for itself (the save key). */
export const RESERVED_PREFIX = 'blacklight.';

function text(value: unknown, what: string, example: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`${what} must be a non-empty string, e.g. ${example}.`);
  }
  return value;
}

function number(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${what} must be a finite number ≥ 0.`);
  }
  return value;
}

function params(value: unknown, platform: 'android' | 'ios'): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new TypeError('SQL parameters must be an array, e.g. ["alice", 3] for "VALUES (?, ?)".');
  }
  return value.map((item: unknown) => {
    // SQLite has no booleans. Blobs: Capacitor SQLite binds a `{ type: 'Buffer', data }` object
    // on Android and a plain byte array on iOS.
    if (typeof item === 'boolean') return item ? 1 : 0;
    if (item instanceof Uint8Array) {
      return platform === 'android' ? { type: 'Buffer', data: Array.from(item) } : Array.from(item);
    }
    if (
      item === null ||
      typeof item === 'string' ||
      (typeof item === 'number' && Number.isFinite(item))
    ) {
      return item;
    }
    throw new TypeError(
      'SQL parameters must be strings, finite numbers, booleans, null or Uint8Array.',
    );
  });
}

/** Blobs come back from the bridge as arrays of bytes; games get `Uint8Array`s. */
function row(values: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) values[key] = Uint8Array.from(value as number[]);
  }
  return values;
}

/** Database names are file names (same rule as `@blacklight/module-sqlite`). */
export const DATABASE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;

function userKey(value: unknown): string {
  const key = text(value, 'A secure-storage key', '"refreshToken"');
  if (key.startsWith(RESERVED_PREFIX)) {
    throw new Error(
      `Secure-storage keys starting with "${RESERVED_PREFIX}" are reserved by the engine (the save key); choose another name than "${key}".`,
    );
  }
  return key;
}

/**
 * `secure-storage`: strings kept by the Android Keystore (encrypted shared preferences) or the
 * iOS Keychain. `get(key) → string | null`, `set(key, value)`, `remove(key)`, `keys()`.
 */
export function secureStorageModule(plugins: Pick<MobilePlugins, 'secureStorage'>): NativeModule {
  const store = plugins.secureStorage;
  return {
    async get(key) {
      const name = userKey(key);
      const { value: keys } = await store.keys();
      if (!keys.includes(name)) return null;
      return (await store.get({ key: name })).value;
    },
    async set(key, value) {
      await store.set({ key: userKey(key), value: text(value, 'A secure-storage value', '"abc"') });
    },
    async remove(key) {
      const name = userKey(key);
      const { value: keys } = await store.keys();
      if (keys.includes(name)) await store.remove({ key: name });
    },
    async keys() {
      return (await store.keys()).value.filter((key) => !key.startsWith(RESERVED_PREFIX));
    },
  };
}

/** Result of `invoke('sqlite', 'execute', …)`. */
export interface SqliteChanges {
  /** Rows inserted, updated or deleted. */
  changes: number;
  /** Row id of the last insert (0 when none). */
  lastInsertId: number;
}

/**
 * `sqlite`, through `@capacitor-community/sqlite`. Databases live in the app's private database
 * folder, by name:
 * - `open(database, options?: { readOnly?: boolean })`
 * - `execute(database, sql, params?) → { changes, lastInsertId }` (several statements when there
 *   are no parameters)
 * - `query(database, sql, params?) → rows` (objects keyed by column name, blobs as `Uint8Array`)
 * - `close(database)`
 *
 * The protocol of `@blacklight/module-sqlite`; parameters are strings, numbers, booleans (1 / 0),
 * `null` or `Uint8Array`.
 */
export function sqliteModule(plugins: Pick<MobilePlugins, 'sqlite' | 'platform'>): NativeModule {
  const db = plugins.sqlite;
  const open = new Map<string, boolean>();
  let cleaned = false;
  const name = (value: unknown) => {
    const database = text(value, 'A database name', '"game.db"');
    if (!DATABASE_NAME.test(database)) {
      throw new Error(
        `Database name "${database}" must be a file name of letters, digits, "_", "-" and "." (64 characters at most), e.g. "game.db".`,
      );
    }
    return database;
  };
  const opened = (value: unknown) => {
    const database = name(value);
    const readonly = open.get(database);
    if (readonly === undefined) {
      throw new Error(`Database "${database}" is not open: call open("${database}") first.`);
    }
    return { database, readonly };
  };
  const changes = (result: { changes?: { changes?: number; lastId?: number } }): SqliteChanges => {
    const { changes: count = 0, lastId = 0 } = result.changes ?? {};
    return { changes: count, lastInsertId: Math.max(0, lastId) };
  };
  return {
    async open(value, options) {
      const database = name(value);
      if (open.has(database)) return;
      const readonly = !!(options as { readOnly?: boolean } | undefined)?.readOnly;
      if (!cleaned) {
        // Connections survive a WebView reload on the native side; drop them so open() works.
        await db.checkConnectionsConsistency({ dbNames: [], openModes: [] });
        cleaned = true;
      }
      await db.createConnection({
        database,
        version: 1,
        encrypted: false,
        mode: 'no-encryption',
        readonly,
      });
      await db.open({ database, readonly });
      open.set(database, readonly);
    },
    async execute(value, sql, values) {
      const { database, readonly } = opened(value);
      const statement = text(sql, 'The SQL', '"CREATE TABLE scores (name TEXT, points INTEGER)"');
      const list = params(values, plugins.platform);
      if (list.length === 0) {
        return changes(
          await db.execute({ database, statements: statement, transaction: false, readonly }),
        );
      }
      return changes(
        await db.run({ database, statement, values: list, transaction: false, readonly }),
      );
    },
    async query(value, sql, values) {
      const { database, readonly } = opened(value);
      const statement = text(sql, 'The SQL', '"SELECT * FROM scores"');
      const { values: rows = [] } = await db.query({
        database,
        statement,
        values: params(values, plugins.platform),
        readonly,
      });
      // iOS puts the column names in a first row.
      return (rows.length > 0 && 'ios_columns' in rows[0]! ? rows.slice(1) : rows).map(row);
    },
    async close(value) {
      const database = name(value);
      const readonly = open.get(database);
      if (readonly === undefined) return;
      open.delete(database);
      await db.close({ database, readonly });
      await db.closeConnection({ database, readonly });
    },
  };
}

/**
 * `haptics`: `impact(style = 'medium')` with `light | medium | heavy`, `notification(type)` with
 * `success | warning | error`, `vibrate(ms = 300)`, `selection()` (a light tick for focus moves).
 */
export function hapticsModule(plugins: Pick<MobilePlugins, 'haptics'>): NativeModule {
  const haptics = plugins.haptics;
  const pick = (table: Record<string, string>, value: unknown, what: string) => {
    const found = table[String(value)];
    if (!found) throw new TypeError(`${what} must be one of ${Object.keys(table).join(', ')}.`);
    return found;
  };
  return {
    impact: (style = 'medium') =>
      haptics.impact({ style: pick(IMPACT_STYLES, style, 'The impact style') }),
    notification: (type = 'success') =>
      haptics.notification({ type: pick(NOTIFICATION_TYPES, type, 'The notification type') }),
    vibrate: (duration = 300) =>
      haptics.vibrate({ duration: number(duration, 'The vibration duration (ms)') }),
    async selection() {
      await haptics.selectionStart();
      await haptics.selectionChanged();
      await haptics.selectionEnd();
    },
  };
}

/**
 * `app`: `info() → { id, name, version, build }`, `exit()`, `minimize()` (Android),
 * `orientation('landscape' | 'portrait' | 'any')`, `keepAwake(on)`, `statusBar(visible)`,
 * `launchUrl() → string | undefined`.
 */
export function appModule(
  plugins: Pick<
    MobilePlugins,
    'app' | 'keepAwake' | 'screenOrientation' | 'systemBars' | 'platform'
  >,
): NativeModule {
  return {
    info: () => plugins.app.getInfo(),
    exit: () => plugins.app.exitApp(),
    async minimize() {
      if (plugins.platform === 'android') await plugins.app.minimizeApp();
    },
    async orientation(value) {
      if (value === 'any') return plugins.screenOrientation.unlock();
      if (value !== 'landscape' && value !== 'portrait') {
        throw new TypeError('The orientation must be "landscape", "portrait" or "any".');
      }
      return plugins.screenOrientation.lock({ orientation: value });
    },
    keepAwake: (on = true) => (on ? plugins.keepAwake.keepAwake() : plugins.keepAwake.allowSleep()),
    statusBar: (visible = true) =>
      visible ? plugins.systemBars.show() : plugins.systemBars.hide(),
    async launchUrl() {
      return (await plugins.app.getLaunchUrl())?.url || undefined;
    },
  };
}

/** A leaderboard row, as `scores(board, limit)` returns it. */
export interface LeaderboardRow {
  rank: number;
  name: string;
  score: number;
}

/**
 * `gamecenter` (iOS) and `playgames` (Android), the calls of `@blacklight/module-achievements`:
 * `unlock(id)`, `submitScore(board, score)`, `scores(board, limit = 10) → [{ rank, name, score }]`
 * (top of the all-time public board); plus `signIn() → { authenticated, playerId?, displayName? }`,
 * `progress(id, current, total)` (Game Center reports the percentage; Play Games sets the steps of
 * an incremental achievement to `current`) and `show()` (the system achievements screen). Calls
 * that need a player sign in first, showing the system sign-in when needed.
 */
export function gamesModule(
  plugins: Pick<MobilePlugins, 'games' | 'platform'>,
  service: 'gamecenter' | 'playgames',
): NativeModule {
  const expected = service === 'gamecenter' ? 'ios' : 'android';
  const check = () => {
    if (plugins.platform !== expected) {
      throw new Error(
        service === 'gamecenter'
          ? 'Game Center exists only on iOS; on Android use the "playgames" backend.'
          : 'Google Play Games Services exist only on Android; on iOS use the "gamecenter" backend.',
      );
    }
  };
  const id = (value: unknown) => text(value, 'An achievement id', '"first_win"');
  return {
    async signIn() {
      check();
      return plugins.games.signIn();
    },
    async unlock(value) {
      check();
      await plugins.games.unlock({ id: id(value) });
    },
    async progress(value, current, total) {
      check();
      const max = number(total, 'The achievement total');
      if (max === 0) throw new TypeError('The achievement total must be greater than 0.');
      await plugins.games.progress({
        id: id(value),
        current: Math.min(number(current, 'The progress'), max),
        total: max,
      });
    },
    async show() {
      check();
      await plugins.games.show();
    },
    async submitScore(board, score) {
      check();
      const value = number(score, 'The score');
      await plugins.games.submitScore({
        board: text(board, 'A leaderboard id', '"high_scores"'),
        score: Math.round(value),
      });
    },
    async scores(board, limit = 10) {
      check();
      const count = number(limit, 'The number of scores');
      const { entries } = await plugins.games.scores({
        board: text(board, 'A leaderboard id', '"high_scores"'),
        limit: Math.max(1, Math.min(25, Math.round(count))),
      });
      return entries.map(({ rank, name, score }): LeaderboardRow => ({ rank, name, score }));
    },
  };
}
