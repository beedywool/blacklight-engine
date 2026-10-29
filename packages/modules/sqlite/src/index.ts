import { defineModule, nativeModule, t, type Infer, type Platform } from '@blacklight/core';
import type { sqliteNative } from './native';
import {
  DATABASE_NAME,
  type ExecuteResult,
  type Row,
  type SqliteBackend,
  type SqlValue,
} from './protocol';
import { webBackend } from './web';

export type { ExecuteResult, Row, SqlValue } from './protocol';

const config = t.object({
  /** Database opened by `sqlite.query()` and friends: a file name in the game's data folder. */
  database: t.string({ pattern: DATABASE_NAME }).default('game.db'),
  /**
   * Schema steps run once each, in order, when the default database opens (tracked with
   * `PRAGMA user_version`). Append new steps; never edit released ones.
   */
  migrations: t.array(t.string({ min: 1 })).default([]),
});

/** Options of the `sqlite` module in `game.config.ts`. */
export type SqliteConfig = Infer<typeof config>;

/**
 * An open SQLite database. Statements run one at a time in call order; use `?` placeholders for
 * values, never string concatenation.
 */
export interface Database {
  readonly name: string;
  /** Runs a write statement (or, without `params`, several statements separated by `;`). */
  execute(sql: string, params?: SqlValue[]): Promise<ExecuteResult>;
  /** Runs a query and returns every row. */
  query<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** First row of a query, or `undefined`. */
  get<T = Row>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  /**
   * Runs `work` inside `BEGIN … COMMIT`; any error rolls back and is rethrown. Other calls wait
   * until it ends.
   */
  transaction<R>(work: (db: Database) => Promise<R>): Promise<R>;
  /** Applies the steps not applied yet (`PRAGMA user_version`); returns the new version. */
  migrate(steps: string[]): Promise<number>;
  close(): Promise<void>;
}

type Backend = {
  [K in keyof SqliteBackend]: (
    ...args: Parameters<SqliteBackend[K]>
  ) => Promise<Awaited<ReturnType<SqliteBackend[K]>>>;
};

function backendFor(platform: Platform, gameId: string): Backend {
  const web = platform as Platform & {
    registerFallback?: (
      module: string,
      fallback: Record<string, (...args: never[]) => unknown>,
    ) => void;
  };
  // Browsers have no native side: sql.js answers the same calls.
  if (platform.name === 'web' && web.registerFallback) {
    const fallback = webBackend({ gameId, files: platform.files });
    web.registerFallback(
      'sqlite',
      fallback as unknown as Record<string, (...args: never[]) => unknown>,
    );
  }
  return nativeModule<typeof sqliteNative>(platform, 'sqlite') as Backend;
}

function createDatabase(backend: Backend, name: string, onClose: () => void): Database {
  let lock: Promise<unknown> = Promise.resolve();
  // Every call waits for the previous one, so a transaction is never interleaved.
  const serial = <R>(work: () => Promise<R>): Promise<R> => {
    const next = lock.then(work, work);
    lock = next.catch(() => undefined);
    return next;
  };

  const direct = (): Database => ({
    name,
    execute: (sql, params) => backend.execute(name, sql, params),
    query: async <T = Row>(sql: string, params?: SqlValue[]) =>
      (await backend.query(name, sql, params)) as T[],
    get: async <T = Row>(sql: string, params?: SqlValue[]) =>
      ((await backend.query(name, sql, params)) as T[])[0],
    transaction: () => {
      throw new Error('Transactions cannot be nested: run the work inside the outer transaction.');
    },
    migrate: () => {
      throw new Error('migrate() cannot run inside a transaction.');
    },
    close: () => {
      throw new Error('close() cannot run inside a transaction.');
    },
  });
  const inner = direct();

  const db: Database = {
    name,
    execute: (sql, params) => serial(() => inner.execute(sql, params)),
    query: (sql, params) => serial(() => inner.query(sql, params)),
    get: (sql, params) => serial(() => inner.get(sql, params)),
    transaction: (work) =>
      serial(async () => {
        await inner.execute('BEGIN');
        try {
          const result = await work(inner);
          await inner.execute('COMMIT');
          return result;
        } catch (error) {
          await inner.execute('ROLLBACK').catch(() => undefined);
          throw error;
        }
      }),
    migrate: (steps) =>
      serial(async () => {
        const row = await inner.get<{ user_version: number }>('PRAGMA user_version');
        let version = Number(row?.user_version ?? 0);
        for (const step of steps.slice(version)) {
          await inner.execute('BEGIN');
          try {
            await inner.execute(step);
            version++;
            await inner.execute(`PRAGMA user_version = ${version}`);
            await inner.execute('COMMIT');
          } catch (error) {
            await inner.execute('ROLLBACK').catch(() => undefined);
            throw new Error(`Migration ${version + 1} failed: ${(error as Error).message}`, {
              cause: error,
            });
          }
        }
        return version;
      }),
    close: () =>
      serial(async () => {
        await backend.close(name);
        onClose();
      }),
  };
  return db;
}

/**
 * Local SQLite databases on every platform (MOD-06): better-sqlite3 in the Electron main process
 * on desktop, Capacitor SQLite on mobile (both through `platform.invoke('sqlite', …)`), sql.js in
 * browsers with the file kept in OPFS (IndexedDB when OPFS is missing).
 *
 * @example
 * ```ts
 * // game.config.ts
 * modules: {
 *   sqlite: { migrations: ['CREATE TABLE scores (name TEXT, points INTEGER)'] },
 * }
 *
 * // in a scene
 * const { sqlite } = this.game.modules;
 * await sqlite.execute('INSERT INTO scores VALUES (?, ?)', ['ann', 1200]);
 * const best = await sqlite.query<{ name: string; points: number }>(
 *   'SELECT * FROM scores ORDER BY points DESC LIMIT 10',
 * );
 * ```
 */
export const sqlite = defineModule({
  name: 'sqlite',
  version: '0.0.0',
  config,
  async setup(context) {
    const backend = backendFor(context.platform, context.game.config.id);
    const databases = new Map<string, Promise<Database>>();

    const open = (name: string = context.config.database): Promise<Database> => {
      if (!DATABASE_NAME.test(name)) {
        return Promise.reject(
          new Error(
            `"${name}" is not a valid database name: use letters, digits, "-", "_" and "." (up to 64), e.g. "game.db".`,
          ),
        );
      }
      let entry = databases.get(name);
      if (!entry) {
        entry = (async () => {
          await backend.open(name);
          return createDatabase(backend, name, () => databases.delete(name));
        })();
        entry.catch(() => databases.delete(name));
        databases.set(name, entry);
      }
      return entry;
    };

    const main = await open();
    if (context.config.migrations.length > 0) await main.migrate(context.config.migrations);
    context.onDispose(async () => {
      for (const entry of databases.values()) await (await entry).close().catch(() => undefined);
    });

    return {
      /** The default database (`modules.sqlite.database`). */
      db: main,
      /** Opens (or returns) another database file. */
      open,
      execute: main.execute,
      query: main.query,
      get: main.get,
      transaction: main.transaction,
      migrate: main.migrate,
    };
  },
});

/** API of the `sqlite` module: `game.modules.sqlite`. */
export type Sqlite = NonNullable<Awaited<ReturnType<(typeof sqlite)['setup']>>>;
