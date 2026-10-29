import type { SaveMeta, SavePayload } from './format';

/** A save as the cloud provider lists it. */
export interface CloudSaveEntry {
  slot: string;
  /** `meta.date` of the remote copy (ms since 1970). */
  date: number;
  playTime?: number;
}

/**
 * Where cloud copies go: a game server, Steam Cloud… The cloud-save module implements it; the save
 * manager decides what to upload, download or ask the player about. Payloads are the decoded saves
 * (data and metadata): the provider chooses how to store and protect them in transit.
 *
 * @example
 * ```ts
 * const memory = new Map<string, SavePayload>();
 * game.save.useCloud({
 *   name: 'memory',
 *   list: async () => [...memory].map(([slot, p]) => ({ slot, date: p.meta.date })),
 *   download: async (slot) => memory.get(slot),
 *   upload: async (slot, payload) => void memory.set(slot, payload),
 *   remove: async (slot) => void memory.delete(slot),
 * });
 * ```
 */
export interface CloudSaveProvider {
  readonly name: string;
  list(): Promise<CloudSaveEntry[]>;
  download(slot: string): Promise<SavePayload | undefined>;
  upload(slot: string, payload: SavePayload): Promise<void>;
  remove(slot: string): Promise<void>;
}

/** Both copies of a slot changed since the last sync. */
export interface SaveConflict {
  slot: string;
  local: SaveMeta;
  remote: CloudSaveEntry;
}

/** Which copy wins a conflict. */
export type ConflictChoice = 'local' | 'remote';

export interface CloudOptions {
  /**
   * `'newest'` keeps the most recent copy; a function asks the player (a save/load screen shows
   * both metadata) and returns the copy to keep. @defaultValue `'newest'`
   */
  conflict?: 'newest' | ((conflict: SaveConflict) => ConflictChoice | Promise<ConflictChoice>);
}

/** What {@link SaveManager.sync} did, slot by slot. */
export interface SyncReport {
  uploaded: string[];
  downloaded: string[];
  /** Conflicts and the copy that was kept. */
  conflicts: { slot: string; kept: ConflictChoice }[];
  /** Set when the provider could not be reached; nothing was lost, the next sync retries. */
  error?: Error;
}
