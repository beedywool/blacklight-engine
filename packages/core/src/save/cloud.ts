import type { SaveMeta, SavePayload } from './format';

/** A save as the cloud provider lists it. */
export interface CloudSaveEntry {
  /** Slot name. */
  slot: string;
  /** `meta.date` of the remote copy (ms since 1970). */
  date: number;
  /** `meta.playTime` of the remote copy (ms), when the provider knows it. */
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
  /** Name shown in logs and errors (`'steam'`, `'server'`). */
  readonly name: string;
  /** Every slot stored remotely, with its date. */
  list(): Promise<CloudSaveEntry[]>;
  /** The remote copy of a slot, `undefined` when there is none. */
  download(slot: string): Promise<SavePayload | undefined>;
  /** Stores a slot remotely, replacing the previous copy. */
  upload(slot: string, payload: SavePayload): Promise<void>;
  /** Deletes the remote copy of a slot. */
  remove(slot: string): Promise<void>;
}

/** Both copies of a slot changed since the last sync. */
export interface SaveConflict {
  /** Slot name. */
  slot: string;
  /** Metadata of the copy on this device. */
  local: SaveMeta;
  /** What the provider lists for the remote copy. */
  remote: CloudSaveEntry;
}

/** Which copy wins a conflict. */
export type ConflictChoice = 'local' | 'remote';

/** Options of `game.save.useCloud()`: how conflicts are settled. */
export interface CloudOptions {
  /**
   * `'newest'` keeps the most recent copy; a function asks the player (a save/load screen shows
   * both metadata) and returns the copy to keep. @defaultValue `'newest'`
   */
  conflict?: 'newest' | ((conflict: SaveConflict) => ConflictChoice | Promise<ConflictChoice>);
}

/** What {@link SaveManager.sync} did, slot by slot. */
export interface SyncReport {
  /** Slots whose local copy was sent. */
  uploaded: string[];
  /** Slots replaced by their remote copy. */
  downloaded: string[];
  /** Conflicts and the copy that was kept. */
  conflicts: {
    /** Slot name. */
    slot: string;
    /** The copy that was kept. */
    kept: ConflictChoice;
  }[];
  /** Set when the provider could not be reached; nothing was lost, the next sync retries. */
  error?: Error;
}
