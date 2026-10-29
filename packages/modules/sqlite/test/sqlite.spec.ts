import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ModuleHost, WebPlatform, type Game, type Platform } from '@blacklight/core';
import { sqlite, type Sqlite } from '../src/index';
import { sqliteNative } from '../src/native';

const dataDir = mkdtempSync(join(tmpdir(), 'blacklight-sqlite-'));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

const migrations = [
  'CREATE TABLE scores (id INTEGER PRIMARY KEY, name TEXT NOT NULL, points INTEGER, art BLOB)',
  'CREATE INDEX scores_points ON scores (points)',
];

/** A desktop platform whose `invoke` goes to the native part, like the Electron IPC bridge. */
function desktopPlatform(): Platform {
  const web = new WebPlatform('desktop-test');
  const context = { gameId: 'com.example.test', dataDir, dev: true };
  return Object.assign(Object.create(web) as Platform, {
    name: 'desktop',
    invoke: (module: string, method: string, ...args: unknown[]) => {
      if (module !== 'sqlite') throw new Error(`no native module ${module}`);
      // Structured clone, as across IPC: only plain data crosses.
      return sqliteNative
        .call(method, structuredClone(args), context)
        .then((r) => structuredClone(r));
    },
  });
}

async function start(platform: Platform, options: object = { migrations }) {
  const game = {
    config: { id: 'com.example.test', modules: { sqlite: options } },
    platform,
  } as unknown as Game;
  const host = new ModuleHost(game);
  await host.install({ definitions: [sqlite] });
  return { api: host.apis.sqlite as Sqlite, host };
}

for (const [label, makePlatform] of [
  ['web (sql.js)', () => new WebPlatform('com.example.test')],
  ['desktop (better-sqlite3 native part)', desktopPlatform],
] as const) {
  describe(`sqlite on ${label}`, () => {
    const platform = makePlatform();

    it('runs migrations, writes with parameters and reads rows', async () => {
      const { api, host } = await start(platform);
      const result = await api.execute('INSERT INTO scores (name, points, art) VALUES (?, ?, ?)', [
        'ann',
        1200,
        new Uint8Array([1, 2, 3]),
      ]);
      expect(result).toEqual({ changes: 1, lastInsertId: 1 });
      await api.execute('INSERT INTO scores (name, points) VALUES (?, ?)', ['bob', 900]);
      const rows = await api.query<{ name: string; points: number }>(
        'SELECT name, points FROM scores ORDER BY points DESC',
      );
      expect(rows).toEqual([
        { name: 'ann', points: 1200 },
        { name: 'bob', points: 900 },
      ]);
      const blob = await api.get<{ art: Uint8Array }>('SELECT art FROM scores WHERE name = ?', [
        'ann',
      ]);
      expect(blob?.art).toEqual(new Uint8Array([1, 2, 3]));
      expect(await api.get('PRAGMA user_version')).toEqual({ user_version: 2 });
      await host.dispose();
    });

    it('keeps the data after a restart and does not rerun migrations', async () => {
      const { api, host } = await start(platform);
      expect(await api.get('SELECT COUNT(*) AS n FROM scores')).toEqual({ n: 2 });
      await host.dispose();
    });

    it('rolls a failed transaction back and keeps statements in order', async () => {
      const { api, host } = await start(platform);
      await expect(
        api.transaction(async (db) => {
          await db.execute('INSERT INTO scores (name, points) VALUES (?, ?)', ['cat', 1]);
          throw new Error('cancelled');
        }),
      ).rejects.toThrow('cancelled');
      const [, count] = await Promise.all([
        api.execute('DELETE FROM scores WHERE name = ?', ['bob']),
        api.get('SELECT COUNT(*) AS n FROM scores'),
      ]);
      expect(count).toEqual({ n: 1 });
      const other = await api.open('other.db');
      await other.execute('CREATE TABLE t (x); INSERT INTO t VALUES (1); INSERT INTO t VALUES (2)');
      expect(await other.query('SELECT x FROM t')).toEqual([{ x: 1 }, { x: 2 }]);
      await expect(api.open('../escape.db')).rejects.toThrow(/not a valid database name/);
      await host.dispose();
    });
  });
}

describe('sqlite native part', () => {
  const context = { gameId: 'com.example.test', dataDir, dev: true };

  it('stores files in the data folder and validates every argument', async () => {
    expect(existsSync(join(dataDir, 'databases', 'game.db'))).toBe(true);
    await expect(sqliteNative.call('open', ['../../etc/passwd'], context)).rejects.toThrow(
      /refused its arguments/,
    );
    await expect(
      sqliteNative.call('query', ['game.db', 'SELECT 1', [{}]], context),
    ).rejects.toThrow(/SQL parameters must be/);
    await expect(sqliteNative.call('query', ['nope.db', 'SELECT 1'], context)).rejects.toThrow(
      /is not open/,
    );
    await expect(sqliteNative.call('drop', [], context)).rejects.toThrow(/does not exist/);
    expect(sqliteNative.methods).toEqual(['open', 'execute', 'query', 'close']);
    await sqliteNative.dispose?.(context);
  });
});
