import type { PlatformFiles } from '@blacklight/core';
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import {
  bindable,
  type ExecuteResult,
  type Row,
  type SqliteBackend,
  type SqlValue,
} from './protocol';

/** Where web databases are kept. */
export interface WebStore {
  read(name: string): Promise<Uint8Array | undefined>;
  write(name: string, data: Uint8Array): Promise<void>;
}

/** The Origin Private File System, when the browser has it with writable files. */
async function opfs(folder: string): Promise<WebStore | undefined> {
  const storage = globalThis.navigator?.storage as StorageManager | undefined;
  if (!storage?.getDirectory) return undefined;
  try {
    const root = await storage.getDirectory();
    const dir = await root.getDirectoryHandle(folder, { create: true });
    const probe = await dir.getFileHandle('.probe', { create: true });
    // Safari before 17 has OPFS without createWritable on the main thread.
    if (typeof (probe as { createWritable?: unknown }).createWritable !== 'function')
      return undefined;
    return {
      async read(name) {
        try {
          const file = await (await dir.getFileHandle(name)).getFile();
          return new Uint8Array(await file.arrayBuffer());
        } catch {
          return undefined;
        }
      },
      async write(name, data) {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(data as Uint8Array<ArrayBuffer>);
        await writable.close();
      },
    };
  } catch {
    return undefined;
  }
}

/** Falls back to the platform's files (IndexedDB on the web). */
function filesStore(files: PlatformFiles): WebStore {
  return {
    read: (name) => files.read(`databases/${name}`),
    write: (name, data) => files.write(`databases/${name}`, data),
  };
}

let engine: Promise<SqlJsStatic> | undefined;

/** sql.js with its WebAssembly inlined: one lazy chunk, no extra file to serve or cache. */
function loadSqlJs(): Promise<SqlJsStatic> {
  engine ??= import('sql.js/dist/sql-wasm-inline.js').then((module) => {
    const init = (module as { default?: unknown }).default ?? module;
    return (init as () => Promise<SqlJsStatic>)();
  });
  return engine;
}

/** Options of {@link webBackend}. */
export interface WebBackendOptions {
  /** Game id: OPFS folder name. */
  gameId: string;
  files: PlatformFiles;
  /** Delay before changes are written to storage (ms). @defaultValue `100` */
  flushDelay?: number;
  /** Store to use instead of OPFS / IndexedDB (tests). */
  store?: WebStore;
}

/**
 * SQLite in the browser: sql.js keeps each database in memory and the whole file is written to
 * OPFS (IndexedDB without it) shortly after each change and when the page is hidden.
 */
export function webBackend(options: WebBackendOptions): SqliteBackend & { flush(): Promise<void> } {
  const open = new Map<string, SqlJsDatabase>();
  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let store: Promise<WebStore> | undefined;
  const getStore = () => {
    store ??= options.store
      ? Promise.resolve(options.store)
      : opfs(`blacklight-${options.gameId}`).then((s) => s ?? filesStore(options.files));
    return store;
  };

  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    const target = await getStore();
    for (const name of [...dirty]) {
      dirty.delete(name);
      const db = open.get(name);
      if (db) await target.write(name, db.export());
    }
  };
  const changed = (name: string) => {
    dirty.add(name);
    timer ??= setTimeout(() => void flush(), options.flushDelay ?? 100);
  };
  globalThis.addEventListener?.('pagehide', () => void flush());

  const database = (name: string) => {
    const db = open.get(name);
    if (!db) {
      throw new Error(`The database "${name}" is not open: call sqlite.open("${name}") first.`);
    }
    return db;
  };

  return {
    flush,
    async open(name) {
      if (open.has(name)) return;
      const [SQL, data] = await Promise.all([loadSqlJs(), getStore().then((s) => s.read(name))]);
      if (open.has(name)) return;
      open.set(name, new SQL.Database(data));
    },
    execute(name, sql, params?: SqlValue[]): ExecuteResult {
      const db = database(name);
      if (params === undefined) db.exec(sql);
      else db.run(sql, bindable(params));
      const changes = db.getRowsModified();
      const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];
      changed(name);
      return { changes, lastInsertId: typeof id === 'number' ? id : 0 };
    },
    query(name, sql, params?: SqlValue[]): Row[] {
      const statement = database(name).prepare(sql, bindable(params));
      const rows: Row[] = [];
      try {
        while (statement.step()) rows.push(statement.getAsObject() as Row);
      } finally {
        statement.free();
      }
      // `INSERT … RETURNING` and friends write through query().
      if (!/^\s*(select|with|pragma|explain|values)\b/i.test(sql)) changed(name);
      return rows;
    },
    async close(name) {
      const db = open.get(name);
      if (!db) return;
      if (dirty.has(name)) await flush();
      db.close();
      open.delete(name);
    },
  };
}
