// The calls every SQLite backend answers, by name, through `platform.invoke('sqlite', …)`:
// better-sqlite3 in the Electron main process (native.ts), Capacitor SQLite on mobile
// (@blacklight/mobile), sql.js in browsers (web.ts). Databases are named files in the game's
// data folder; every call after `open` names the database it targets.

/** A value bound to a `?` placeholder. Booleans are stored as 1 / 0. */
export type SqlValue = string | number | boolean | null | Uint8Array;

/** A result row: column name → value (blobs as `Uint8Array`). */
export type Row = Record<string, string | number | null | Uint8Array>;

/** What a write statement changed. */
export interface ExecuteResult {
  /** Rows inserted, updated or deleted. */
  changes: number;
  /** Row id of the last insert (0 when none). */
  lastInsertId: number;
}

/**
 * The backend protocol. `execute` without parameters may hold several statements separated by
 * semicolons (schemas, migrations); with parameters it runs one statement.
 */
export interface SqliteBackend {
  open(database: string): Promise<void> | void;
  execute(
    database: string,
    sql: string,
    params?: SqlValue[],
  ): Promise<ExecuteResult> | ExecuteResult;
  query(database: string, sql: string, params?: SqlValue[]): Promise<Row[]> | Row[];
  close(database: string): Promise<void> | void;
}

/** Database names are file names in the data folder: no paths, no surprises. */
export const DATABASE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/;

/** Booleans become integers, as SQLite has no boolean type. */
export function bindable(params: SqlValue[] | undefined): (string | number | null | Uint8Array)[] {
  return (params ?? []).map((value) => (typeof value === 'boolean' ? (value ? 1 : 0) : value));
}
