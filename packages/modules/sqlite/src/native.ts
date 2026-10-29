// `@blacklight/module-sqlite/native`: the desktop backend, run by the Electron main process.
// The game never imports this file (only its type), so better-sqlite3 stays out of the game bundle.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { t } from '@blacklight/core/schema';
import { defineNative, fn } from '@blacklight/native/define-native';
import { DATABASE_NAME, bindable, type ExecuteResult, type Row } from './protocol';

const open = new Map<string, BetterSqlite3.Database>();

const name = t.string({ pattern: DATABASE_NAME });
const sql = t.string({ min: 1 });
const value = t.unknown();
const params = t.array(value, { max: 999 }).optional();

function database(file: string): BetterSqlite3.Database {
  const db = open.get(file);
  if (!db)
    throw new Error(`The database "${file}" is not open: call sqlite.open("${file}") first.`);
  return db;
}

function checkValues(values: unknown[] | undefined): void {
  for (const v of values ?? []) {
    const ok =
      v === null ||
      typeof v === 'string' ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      v instanceof Uint8Array;
    if (!ok)
      throw new Error(
        'SQL parameters must be strings, finite numbers, booleans, null or Uint8Array.',
      );
  }
}

/** Blobs come back from better-sqlite3 as Buffers; the game expects plain Uint8Arrays. */
function plain(row: Record<string, unknown>): Row {
  for (const [key, v] of Object.entries(row)) {
    if (v instanceof Uint8Array) row[key] = new Uint8Array(v);
    else if (typeof v === 'bigint') row[key] = Number(v);
  }
  return row as Row;
}

/**
 * better-sqlite3 behind the `sqlite` native name: `open`, `execute`, `query`, `close`, the same
 * calls Capacitor SQLite answers on mobile. Files live in `<data folder>/databases/`, in WAL mode.
 */
export const sqliteNative = defineNative({
  name: 'sqlite',
  functions: {
    open: fn([name], (context, file) => {
      if (open.has(file)) return;
      const dir = join(context.dataDir, 'databases');
      mkdirSync(dir, { recursive: true });
      const db = new BetterSqlite3(join(dir, file));
      db.pragma('journal_mode = WAL');
      open.set(file, db);
    }),
    execute: fn([name, sql, params], (_context, file, text, values): ExecuteResult => {
      checkValues(values);
      const db = database(file);
      if (values === undefined) {
        const before = db.prepare('SELECT total_changes() AS n').get() as { n: number };
        db.exec(text);
        const after = db
          .prepare('SELECT total_changes() AS n, last_insert_rowid() AS id')
          .get() as {
          n: number;
          id: number;
        };
        return { changes: after.n - before.n, lastInsertId: after.id };
      }
      const result = db.prepare(text).run(bindable(values as never));
      return { changes: result.changes, lastInsertId: Number(result.lastInsertRowid) };
    }),
    query: fn([name, sql, params], (_context, file, text, values): Row[] => {
      checkValues(values);
      const statement = database(file).prepare(text);
      if (!statement.reader) {
        statement.run(bindable(values as never));
        return [];
      }
      return (statement.all(bindable(values as never)) as Record<string, unknown>[]).map(plain);
    }),
    close: fn([name], (_context, file) => {
      open.get(file)?.close();
      open.delete(file);
    }),
  },
  dispose() {
    for (const db of open.values()) db.close();
    open.clear();
  },
});
