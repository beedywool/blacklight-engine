// Storage: one SQLite file (node:sqlite, no native dependency to build). Every table hangs off an
// account with ON DELETE CASCADE, so deleting an account erases all of its data in one statement.
import { randomBytes, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export interface Identity {
  issuer: string;
  subject: string;
}

export interface Account {
  id: string;
  name: string;
  identities: Identity[];
}

export interface SaveMeta {
  slot: string;
  revision: number;
  updatedAt: number;
  size: number;
}

export interface ScoreEntry {
  rank: number;
  accountId: string;
  name: string;
  score: number;
  at: number;
}

const SCHEMA = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS identities (
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    linked_at INTEGER NOT NULL,
    PRIMARY KEY (issuer, subject)
  );
  CREATE INDEX IF NOT EXISTS identities_account ON identities(account_id);
  CREATE TABLE IF NOT EXISTS saves (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    slot TEXT NOT NULL,
    revision INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (account_id, game, slot)
  );
  CREATE TABLE IF NOT EXISTS achievements (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    id TEXT NOT NULL,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, game, id)
  );
  CREATE TABLE IF NOT EXISTS scores (
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    board TEXT NOT NULL,
    score REAL NOT NULL,
    at INTEGER NOT NULL,
    PRIMARY KEY (account_id, game, board)
  );
  CREATE INDEX IF NOT EXISTS scores_board ON scores(game, board, score);
`;

type Row = Record<string, unknown>;

/** The server's data. `path` is a file, or `:memory:` for tests. */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    // WAL lets reads continue while a write is in progress; it has no effect in memory.
    if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // Accounts and identities

  createAccount(name: string): Account {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO accounts (id, name, created_at) VALUES (?, ?, ?)')
      .run(id, name, Date.now());
    return { id, name, identities: [] };
  }

  /** A guest account, named `Player-XXXX`. */
  createGuest(): Account {
    return this.createAccount(`Player-${randomBytes(2).toString('hex').toUpperCase()}`);
  }

  account(id: string): Account | undefined {
    const row = this.db.prepare('SELECT id, name FROM accounts WHERE id = ?').get(id) as
      Row | undefined;
    if (!row) return undefined;
    const identities = this.db
      .prepare('SELECT issuer, subject FROM identities WHERE account_id = ? ORDER BY linked_at')
      .all(id) as Row[];
    return {
      id: String(row.id),
      name: String(row.name),
      identities: identities.map((r) => ({ issuer: String(r.issuer), subject: String(r.subject) })),
    };
  }

  rename(id: string, name: string): void {
    this.db.prepare('UPDATE accounts SET name = ? WHERE id = ?').run(name, id);
  }

  deleteAccount(id: string): void {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  /** Account id an identity is linked to. */
  identityOwner(identity: Identity): string | undefined {
    const row = this.db
      .prepare('SELECT account_id FROM identities WHERE issuer = ? AND subject = ?')
      .get(identity.issuer, identity.subject) as Row | undefined;
    return row ? String(row.account_id) : undefined;
  }

  link(accountId: string, identity: Identity): void {
    this.db
      .prepare(
        'INSERT INTO identities (issuer, subject, account_id, linked_at) VALUES (?, ?, ?, ?)',
      )
      .run(identity.issuer, identity.subject, accountId, Date.now());
  }

  /** `false` when the identity is not linked to this account. */
  unlink(accountId: string, identity: Identity): boolean {
    const result = this.db
      .prepare('DELETE FROM identities WHERE account_id = ? AND issuer = ? AND subject = ?')
      .run(accountId, identity.issuer, identity.subject);
    return Number(result.changes) > 0;
  }

  // Saves

  saves(accountId: string, game: string): SaveMeta[] {
    const rows = this.db
      .prepare(
        'SELECT slot, revision, updated_at, length(data) AS size FROM saves WHERE account_id = ? AND game = ? ORDER BY slot',
      )
      .all(accountId, game) as Row[];
    return rows.map(toMeta);
  }

  saveMeta(accountId: string, game: string, slot: string): SaveMeta | undefined {
    const row = this.db
      .prepare(
        'SELECT slot, revision, updated_at, length(data) AS size FROM saves WHERE account_id = ? AND game = ? AND slot = ?',
      )
      .get(accountId, game, slot) as Row | undefined;
    return row && toMeta(row);
  }

  save(accountId: string, game: string, slot: string): (SaveMeta & { data: Buffer }) | undefined {
    const row = this.db
      .prepare(
        'SELECT slot, revision, updated_at, length(data) AS size, data FROM saves WHERE account_id = ? AND game = ? AND slot = ?',
      )
      .get(accountId, game, slot) as Row | undefined;
    return row && { ...toMeta(row), data: Buffer.from(row.data as Uint8Array) };
  }

  /** Writes a slot with the next revision. */
  writeSave(
    accountId: string,
    game: string,
    slot: string,
    data: Buffer,
    updatedAt: number,
  ): SaveMeta {
    const revision = (this.saveMeta(accountId, game, slot)?.revision ?? 0) + 1;
    this.db
      .prepare(
        `INSERT INTO saves (account_id, game, slot, revision, updated_at, data) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (account_id, game, slot) DO UPDATE SET revision = excluded.revision,
           updated_at = excluded.updated_at, data = excluded.data`,
      )
      .run(accountId, game, slot, revision, updatedAt, data);
    return { slot, revision, updatedAt, size: data.length };
  }

  deleteSave(accountId: string, game: string, slot: string): void {
    this.db
      .prepare('DELETE FROM saves WHERE account_id = ? AND game = ? AND slot = ?')
      .run(accountId, game, slot);
  }

  // Achievements

  achievements(accountId: string, game: string): { id: string; unlockedAt: number }[] {
    const rows = this.db
      .prepare(
        'SELECT id, unlocked_at FROM achievements WHERE account_id = ? AND game = ? ORDER BY unlocked_at, id',
      )
      .all(accountId, game) as Row[];
    return rows.map((r) => ({ id: String(r.id), unlockedAt: Number(r.unlocked_at) }));
  }

  /** Unlocks once; later calls keep the first date. */
  unlock(accountId: string, game: string, id: string, unlockedAt: number): number {
    this.db
      .prepare(
        'INSERT INTO achievements (account_id, game, id, unlocked_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      )
      .run(accountId, game, id, unlockedAt);
    const row = this.db
      .prepare('SELECT unlocked_at FROM achievements WHERE account_id = ? AND game = ? AND id = ?')
      .get(accountId, game, id) as Row;
    return Number(row.unlocked_at);
  }

  // Leaderboards. `order` comes from the server's configuration, never from a request.

  submitScore(
    accountId: string,
    game: string,
    board: string,
    score: number,
    order: 'asc' | 'desc',
  ): number {
    const better =
      order === 'desc' ? 'excluded.score > scores.score' : 'excluded.score < scores.score';
    this.db
      .prepare(
        `INSERT INTO scores (account_id, game, board, score, at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (account_id, game, board) DO UPDATE SET score = excluded.score, at = excluded.at
         WHERE ${better}`,
      )
      .run(accountId, game, board, score, Date.now());
    return this.myScore(accountId, game, board, order)!.score;
  }

  leaderboard(
    game: string,
    board: string,
    order: 'asc' | 'desc',
    limit: number,
    offset: number,
  ): ScoreEntry[] {
    const direction = order === 'desc' ? 'DESC' : 'ASC';
    const rows = this.db
      .prepare(
        `SELECT RANK() OVER (ORDER BY s.score ${direction}) AS rank, s.account_id, a.name, s.score, s.at
         FROM scores s JOIN accounts a ON a.id = s.account_id
         WHERE s.game = ? AND s.board = ?
         ORDER BY s.score ${direction}, s.at ASC LIMIT ? OFFSET ?`,
      )
      .all(game, board, limit, offset) as Row[];
    return rows.map((r) => ({
      rank: Number(r.rank),
      accountId: String(r.account_id),
      name: String(r.name),
      score: Number(r.score),
      at: Number(r.at),
    }));
  }

  /** Rank 1 is the best; equal scores share a rank. */
  myScore(
    accountId: string,
    game: string,
    board: string,
    order: 'asc' | 'desc',
  ): { rank: number; score: number } | undefined {
    const row = this.db
      .prepare('SELECT score FROM scores WHERE account_id = ? AND game = ? AND board = ?')
      .get(accountId, game, board) as Row | undefined;
    if (!row) return undefined;
    const score = Number(row.score);
    const comparison = order === 'desc' ? '>' : '<';
    const better = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM scores WHERE game = ? AND board = ? AND score ${comparison} ?`,
      )
      .get(game, board, score) as Row;
    return { rank: Number(better.n) + 1, score };
  }
}

function toMeta(row: Row): SaveMeta {
  return {
    slot: String(row.slot),
    revision: Number(row.revision),
    updatedAt: Number(row.updated_at),
    size: Number(row.size),
  };
}
