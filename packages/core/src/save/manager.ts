import { EventBus, type Unsubscribe } from '../events';
import type { Platform } from '../platform';
import type {
  CloudOptions,
  CloudSaveEntry,
  CloudSaveProvider,
  ConflictChoice,
  SyncReport,
} from './cloud';
import {
  resolveSaveConfig,
  type ResolvedSaveConfig,
  type SaveConfig,
  type SaveData,
} from './config';
import {
  SaveError,
  decodeExport,
  decodeSave,
  encodeExport,
  encodeSave,
  type SaveCodec,
  type SaveMeta,
  type SavePayload,
} from './format';
import { screenSlots, type ScreenSlots, type ScreenSlotsOptions } from './ui-slots';

/** A slot: `1`…`slots`, `'auto'`, or a name such as `'quick'` (letters, digits, `-`, `_`). */
export type SaveSlot = number | string;

/** One entry of {@link SaveManager.list}. */
export interface SaveSlotInfo {
  slot: string;
  /** `ok`, or why the slot cannot be loaded (`backup` may still be). */
  status: 'ok' | 'corrupted' | 'tampered' | 'version' | 'missing';
  /** Metadata of the save (`ok` and `version`) or of its backup (otherwise). */
  meta?: SaveMeta;
  /** Format version of the data. */
  version?: number;
  /** A previous version exists and can be loaded with `load(slot, { backup: true })`. */
  hasBackup: boolean;
}

export interface SaveOptions {
  /** `false` skips the picture, a string is used as is (data URL). @defaultValue `true` */
  thumbnail?: boolean | string;
  /** Free text shown in slot lists (chapter, place). */
  label?: string;
  /** One line of detail shown in slot lists. */
  summary?: string;
}

/** Events of `game.save.events`. */
export interface SaveEvents {
  saved: { slot: string; meta: SaveMeta };
  loaded: { slot: string; meta: SaveMeta; backup: boolean };
  deleted: { slot: string };
  /** A slot could not be read (status `corrupted` or `tampered`). */
  rejected: { slot: string; error: SaveError };
  synced: SyncReport;
}

/** What the save manager needs from the game (structural, so tests can pass a stub). */
export interface SaveHost {
  readonly config: { id: string; save?: SaveConfig };
  readonly platform: Platform;
  readonly release?: boolean;
  readonly events: {
    on(event: 'step', listener: () => void): Unsubscribe;
    on(event: 'scene', listener: (payload: { name: string }) => void): Unsubscribe;
  };
  readonly time: { readonly dt: number };
  readonly scene?: { readonly name: string } | undefined;
  readonly app?: unknown;
}

const SLOT_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/i;
const DIR = 'saves/';
const SYNC_FILE = `${DIR}cloud-sync.json`;

/**
 * `game.save`: the current save data and its slots. Files go to `game.platform.files` (the OS data
 * folder, app storage or IndexedDB); release builds encrypt them with the per-install key and sign
 * them, dev builds write readable JSON. Writes are atomic and keep the previous version as a
 * backup.
 *
 * @example
 * ```ts
 * this.game.save.data.gold = 120;
 * await this.game.save.save(1);
 * const slots = await this.game.save.list();
 * try {
 *   await this.game.save.load(1);
 * } catch (error) {
 *   if (error instanceof SaveError && error.hasBackup) await this.game.save.load(1, { backup: true });
 * }
 * ```
 */
export class SaveManager {
  /** Data of the current game; written by {@link save}, replaced by {@link load}. */
  data: SaveData = {};
  /** Slot last saved or loaded. */
  slot: string | undefined;
  /** Play time of the current game in ms (game time, paused time excluded). */
  playTime = 0;
  readonly events = new EventBus<SaveEvents>();
  readonly config: ResolvedSaveConfig;

  private queue: Promise<unknown> = Promise.resolve();
  private sinceAutosave = 0;
  private cloud: CloudSaveProvider | undefined;
  private cloudOptions: CloudOptions = {};
  private readonly codec: SaveCodec;

  constructor(private readonly host: SaveHost) {
    this.config = resolveSaveConfig(host.config.save, host.release ?? false);
    this.codec = {
      encryption: this.config.encryption,
      integrity: this.config.integrity,
      key: () => this.host.platform.saveKey(),
    };
    host.events.on('step', () => {
      const ms = host.time.dt * 1000;
      this.playTime += ms;
      const interval = this.config.autosave.interval * 1000;
      // The epsilon absorbs float drift: 60 steps of 1000/60 ms make 999.99… ms.
      if (interval > 0 && (this.sinceAutosave += ms) >= interval - 1e-6) {
        this.sinceAutosave = 0;
        void this.autosave().catch(() => undefined);
      }
    });
    host.events.on('scene', () => {
      if (this.config.autosave.onSceneChange) void this.autosave().catch(() => undefined);
    });
  }

  /** Starts a new game: replaces the data, forgets the slot and resets the play time. */
  reset(data: SaveData = {}): void {
    this.data = data;
    this.slot = undefined;
    this.playTime = 0;
  }

  /**
   * Writes the current data to `slot` (the last slot used, else 1). The previous file of the slot
   * becomes its backup when it was valid.
   */
  save(slot: SaveSlot = this.slot ?? 1, options: SaveOptions = {}): Promise<SaveMeta> {
    const key = this.slotKey(slot);
    return this.serial(async () => {
      const meta: SaveMeta = {
        date: Date.now(),
        playTime: Math.round(this.playTime),
        ...(this.host.scene?.name ? { scene: this.host.scene.name } : {}),
        ...(options.label ? { label: options.label } : {}),
        ...(options.summary ? { summary: options.summary } : {}),
      };
      const thumbnail =
        typeof options.thumbnail === 'string'
          ? options.thumbnail
          : options.thumbnail === false
            ? undefined
            : this.captureThumbnail();
      if (thumbnail) meta.thumbnail = thumbnail;
      const payload: SavePayload = {
        version: this.config.version,
        meta,
        // A copy: later changes to `data` must not alter what was written (and protected values
        // are read through their getters here).
        data: JSON.parse(JSON.stringify(this.data)) as SaveData,
      };
      await this.writeSlot(key, payload);
      this.slot = key;
      this.events.emit('saved', { slot: key, meta });
      this.push(key, payload);
      return meta;
    });
  }

  /** Writes the `'auto'` slot when a game is in progress (`data` not empty). */
  async autosave(): Promise<SaveMeta | undefined> {
    if (Object.keys(this.data).length === 0) return undefined;
    const slot = this.slot;
    const meta = await this.save('auto');
    this.slot = slot ?? 'auto';
    return meta;
  }

  /**
   * Loads a slot into {@link data}, migrating older formats.
   *
   * @throws {@link SaveError}: `missing`, `tampered` (modified file), `corrupted`, or `version` (a
   * newer game wrote it, or a migration is missing). `error.hasBackup` says whether
   * `load(slot, { backup: true })` can load the previous version instead.
   */
  load(slot: SaveSlot, options: { backup?: boolean } = {}): Promise<SaveData> {
    const key = this.slotKey(slot);
    return this.serial(async () => {
      const payload = await this.readSlot(key, options.backup ?? false);
      this.data = payload.data;
      this.slot = key;
      this.playTime = payload.meta.playTime ?? 0;
      this.events.emit('loaded', {
        slot: key,
        meta: payload.meta,
        backup: options.backup ?? false,
      });
      return this.data;
    });
  }

  /** Every slot on this device, numbered slots first, with its status and metadata. */
  list(): Promise<SaveSlotInfo[]> {
    return this.serial(async () => {
      const files = await this.host.platform.files.list(DIR);
      const slots = new Set<string>();
      for (const file of files) {
        const match = /^saves\/(.+)\.(sav|bak)$/.exec(file);
        if (match) slots.add(match[1]!);
      }
      const infos: SaveSlotInfo[] = [];
      for (const slot of [...slots].sort(compareSlots)) {
        const hasBackup = files.includes(`${DIR}${slot}.bak`);
        try {
          const payload = await this.readFile(`${DIR}${slot}.sav`);
          const migrated = this.migrationProblem(payload);
          infos.push({
            slot,
            status: migrated ? 'version' : 'ok',
            meta: payload.meta,
            version: payload.version,
            hasBackup,
          });
        } catch (error) {
          const code = error instanceof SaveError ? error.code : 'corrupted';
          let meta: SaveMeta | undefined;
          if (hasBackup) {
            meta = await this.readFile(`${DIR}${slot}.bak`).then(
              (p) => p.meta,
              () => undefined,
            );
          }
          infos.push({
            slot,
            status: code === 'tampered' ? 'tampered' : code === 'missing' ? 'missing' : 'corrupted',
            meta,
            hasBackup: meta !== undefined,
          });
        }
      }
      return infos;
    });
  }

  /** `true` when the slot has a save file (valid or not). */
  async exists(slot: SaveSlot): Promise<boolean> {
    return (await this.host.platform.files.read(`${DIR}${this.slotKey(slot)}.sav`)) !== undefined;
  }

  /** Deletes a slot, its backup and its cloud copy. */
  delete(slot: SaveSlot): Promise<void> {
    const key = this.slotKey(slot);
    return this.serial(async () => {
      await this.host.platform.files.remove(`${DIR}${key}.sav`);
      await this.host.platform.files.remove(`${DIR}${key}.bak`);
      if (this.slot === key) this.slot = undefined;
      this.events.emit('deleted', { slot: key });
      if (this.cloud) {
        const cloud = this.cloud;
        void cloud.remove(key).catch(() => undefined);
        await this.updateSyncState((state) => delete state[key]);
      }
    });
  }

  /**
   * Encrypts slots (all by default) with a password, to move them to another device or install.
   * The result is a file to give the player (see {@link downloadExport}).
   */
  export(password: string, slots?: SaveSlot[]): Promise<Uint8Array> {
    return this.serial(async () => {
      const keys = slots
        ? slots.map((s) => this.slotKey(s))
        : (await this.host.platform.files.list(DIR))
            .map((f) => /^saves\/(.+)\.sav$/.exec(f)?.[1])
            .filter((s): s is string => s !== undefined);
      const saves: Record<string, SavePayload> = {};
      for (const key of keys) saves[key] = await this.readSlot(key, false);
      return encodeExport({ game: this.host.config.id, saves }, password);
    });
  }

  /**
   * Imports an export made by {@link export}. Existing slots with the same name are replaced (their
   * previous version is kept as backup).
   *
   * @returns The imported slots.
   * @throws {@link SaveError} `password` for a wrong password, `corrupted` for a file from another
   * game or not an export.
   */
  import(file: Uint8Array, password: string): Promise<string[]> {
    return this.serial(async () => {
      const content = await decodeExport(file, password);
      if (content.game !== this.host.config.id) {
        throw new SaveError(
          'corrupted',
          `This export belongs to another game ("${content.game}"); this game is "${this.host.config.id}".`,
        );
      }
      const slots = Object.keys(content.saves);
      for (const slot of slots) await this.writeSlot(this.slotKey(slot), content.saves[slot]!);
      return slots;
    });
  }

  // ModuleSaves (modules/define.ts): what modules such as cloud-save use. Bytes are the decoded
  // save (data and metadata) as UTF-8 JSON, readable by any install; `importSlot` encrypts them
  // again with this install's key.

  /**
   * The `SaveSlots` of `@blacklight/ui`'s save/load and pause screens, over these saves.
   *
   * @example
   * ```ts
   * this.ui.push(SaveLoadScreen, { slots: this.game.save.screenSlots(), mode: 'load' });
   * ```
   */
  screenSlots(options?: ScreenSlotsOptions): ScreenSlots {
    return screenSlots(this, options);
  }

  /** Valid slots and when each was written (for modules; screens use {@link list}). */
  async slots(): Promise<{ slot: string; updatedAt: number }[]> {
    return (await this.list())
      .filter((info) => info.status === 'ok' && info.meta)
      .map((info) => ({ slot: info.slot, updatedAt: info.meta!.date }));
  }

  /** A slot as portable bytes, `undefined` when it is empty or unreadable. */
  async exportSlot(slot: string): Promise<Uint8Array | undefined> {
    const key = this.slotKey(slot);
    const payload = await this.serial(() => this.readSlot(key, false)).catch(() => undefined);
    return payload ? new TextEncoder().encode(JSON.stringify(payload)) : undefined;
  }

  /** Replaces a slot with bytes from {@link exportSlot} (another device, the cloud). */
  importSlot(slot: string, data: Uint8Array): Promise<void> {
    const key = this.slotKey(slot);
    return this.serial(async () => {
      let payload: SavePayload;
      try {
        payload = JSON.parse(new TextDecoder().decode(data)) as SavePayload;
      } catch {
        throw new SaveError('corrupted', 'The imported save is not valid JSON.', key);
      }
      if (
        typeof payload?.version !== 'number' ||
        typeof payload.meta !== 'object' ||
        !payload.data
      ) {
        throw new SaveError(
          'corrupted',
          'The imported save does not have the expected fields.',
          key,
        );
      }
      await this.writeSlot(key, payload);
    });
  }

  /** Calls `listener` after each successful write of a slot. */
  onSaved(listener: (slot: string) => void): Unsubscribe {
    return this.events.on('saved', ({ slot }) => listener(slot));
  }

  /** Exports with {@link export} and hands the file to the player (browser download, save dialog on desktop). */
  async downloadExport(
    password: string,
    fileName = `${this.host.config.id}.blsave`,
  ): Promise<void> {
    const data = await this.export(password);
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)]));
    const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Keeps slots in sync with a cloud provider (the cloud-save module, Steam Cloud): every save is
   * uploaded in the background, {@link sync} reconciles both sides.
   */
  useCloud(provider: CloudSaveProvider | undefined, options: CloudOptions = {}): void {
    this.cloud = provider;
    this.cloudOptions = options;
  }

  /**
   * Reconciles local slots with the cloud: a slot changed on one side only is copied to the other,
   * a slot changed on both sides is a conflict resolved by `options.conflict` (newest by default).
   * Offline, nothing changes and `report.error` is set.
   */
  sync(): Promise<SyncReport> {
    return this.serial(async () => {
      const report: SyncReport = { uploaded: [], downloaded: [], conflicts: [] };
      const cloud = this.cloud;
      if (!cloud) return report;
      try {
        const remote = new Map((await cloud.list()).map((entry) => [entry.slot, entry]));
        const state = await this.readSyncState();
        const local = new Map<string, SavePayload>();
        for (const file of await this.host.platform.files.list(DIR)) {
          const slot = /^saves\/(.+)\.sav$/.exec(file)?.[1];
          if (!slot) continue;
          const payload = await this.readFile(file).catch(() => undefined);
          if (payload) local.set(slot, payload);
        }
        for (const slot of new Set([...local.keys(), ...remote.keys()])) {
          const mine = local.get(slot);
          const theirs = remote.get(slot);
          const synced = state[slot];
          let action: 'upload' | 'download' | undefined;
          if (mine && !theirs) action = 'upload';
          else if (!mine && theirs) action = 'download';
          else if (mine && theirs && mine.meta.date !== theirs.date) {
            if (theirs.date === synced) action = 'upload';
            else if (mine.meta.date === synced) action = 'download';
            else {
              const kept = await this.resolveConflict(slot, mine.meta, theirs);
              report.conflicts.push({ slot, kept });
              action = kept === 'local' ? 'upload' : 'download';
            }
          }
          if (action === 'upload') {
            await cloud.upload(slot, mine!);
            state[slot] = mine!.meta.date;
            report.uploaded.push(slot);
          } else if (action === 'download') {
            const payload = await cloud.download(slot);
            if (!payload) continue;
            await this.writeSlot(slot, payload);
            state[slot] = payload.meta.date;
            report.downloaded.push(slot);
          } else if (mine) {
            state[slot] = mine.meta.date;
          }
        }
        await this.writeSyncState(state);
      } catch (error) {
        report.error = error instanceof Error ? error : new Error(String(error));
      }
      this.events.emit('synced', report);
      return report;
    });
  }

  private async resolveConflict(
    slot: string,
    local: SaveMeta,
    remote: CloudSaveEntry,
  ): Promise<ConflictChoice> {
    const policy = this.cloudOptions.conflict ?? 'newest';
    if (policy === 'newest') return local.date >= remote.date ? 'local' : 'remote';
    return policy({ slot, local, remote });
  }

  /** Uploads after a save, in the background; failures wait for the next {@link sync}. */
  private push(slot: string, payload: SavePayload): void {
    const cloud = this.cloud;
    if (!cloud) return;
    cloud.upload(slot, payload).then(
      () => this.serial(() => this.updateSyncState((state) => (state[slot] = payload.meta.date))),
      () => undefined,
    );
  }

  private async readSyncState(): Promise<Record<string, number>> {
    const file = await this.host.platform.files.read(SYNC_FILE);
    if (!file) return {};
    try {
      return JSON.parse(new TextDecoder().decode(file)) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private writeSyncState(state: Record<string, number>): Promise<void> {
    return this.host.platform.files.write(
      SYNC_FILE,
      new TextEncoder().encode(JSON.stringify(state)),
    );
  }

  private async updateSyncState(change: (state: Record<string, number>) => void): Promise<void> {
    const state = await this.readSyncState();
    change(state);
    await this.writeSyncState(state);
  }

  /** Writes a slot; the current file becomes the backup when it is still valid. */
  private async writeSlot(slot: string, payload: SavePayload): Promise<void> {
    const files = this.host.platform.files;
    const path = `${DIR}${slot}.sav`;
    const previous = await files.read(path);
    if (previous) {
      // A corrupted or modified file must not replace a good backup.
      const valid = await decodeSave(previous, this.codec).then(
        () => true,
        () => false,
      );
      if (valid) await files.write(`${DIR}${slot}.bak`, previous);
    }
    await files.write(path, await encodeSave(payload, this.codec));
  }

  private async readSlot(slot: string, backup: boolean): Promise<SavePayload> {
    const path = `${DIR}${slot}.${backup ? 'bak' : 'sav'}`;
    let payload: SavePayload;
    try {
      payload = await this.readFile(path);
    } catch (error) {
      if (!(error instanceof SaveError)) throw error;
      Object.assign(error, { slot });
      if (!backup) {
        error.hasBackup = await this.readFile(`${DIR}${slot}.bak`).then(
          () => true,
          () => false,
        );
        if (error.code !== 'missing') this.events.emit('rejected', { slot, error });
      }
      throw error;
    }
    return this.migrate(slot, payload);
  }

  private async readFile(path: string): Promise<SavePayload> {
    const file = await this.host.platform.files.read(path);
    if (!file) throw new SaveError('missing', `No save at ${path}.`);
    return decodeSave(file, this.codec);
  }

  private migrationProblem(payload: SavePayload): string | undefined {
    const target = this.config.version;
    if (payload.version > target) {
      return `This save was written by a newer version of the game (save format ${payload.version}, this build reads up to ${target}). Update the game.`;
    }
    for (let v = payload.version + 1; v <= target; v++) {
      if (!this.config.migrations[v]) {
        return `No migration from save format ${v - 1} to ${v}: add \`save.migrations[${v}]\` in game.config.ts.`;
      }
    }
    return undefined;
  }

  private migrate(slot: string, payload: SavePayload): SavePayload {
    const problem = this.migrationProblem(payload);
    if (problem) throw new SaveError('version', problem, slot);
    let data = payload.data as Record<string, unknown>;
    for (let v = payload.version + 1; v <= this.config.version; v++) {
      data = this.config.migrations[v]!(data);
    }
    return { ...payload, version: this.config.version, data: data as SaveData };
  }

  private slotKey(slot: SaveSlot): string {
    if (typeof slot === 'number') {
      if (!Number.isInteger(slot) || slot < 1 || slot > this.config.slots) {
        throw new SaveError(
          'invalid-slot',
          `Save slot ${slot} does not exist: numbered slots go from 1 to ${this.config.slots} (\`save.slots\` in game.config.ts).`,
        );
      }
      return String(slot);
    }
    if (/^\d+$/.test(slot)) return this.slotKey(Number(slot));
    if (!SLOT_NAME.test(slot)) {
      throw new SaveError(
        'invalid-slot',
        `Invalid save slot "${slot}": use a number or a name made of letters, digits, "-" and "_" (up to 32).`,
      );
    }
    return slot;
  }

  /** Runs file operations one at a time, in call order. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** A 320 px wide JPEG of the current frame, when a renderer is running. */
  private captureThumbnail(): string | undefined {
    const app = this.host.app as
      | {
          renderer?: { extract?: { canvas(target: unknown): unknown } };
          stage?: unknown;
        }
      | undefined;
    if (!app?.renderer?.extract || typeof document === 'undefined') return undefined;
    try {
      const frame = app.renderer.extract.canvas(app.stage) as HTMLCanvasElement;
      const out = document.createElement('canvas');
      out.width = 320;
      out.height = Math.max(1, Math.round((320 * frame.height) / Math.max(1, frame.width)));
      out.getContext('2d')?.drawImage(frame, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.7);
    } catch {
      return undefined;
    }
  }
}

function compareSlots(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : Infinity;
  const nb = /^\d+$/.test(b) ? Number(b) : Infinity;
  if (na !== nb) return na - nb;
  if (a === 'auto') return -1;
  if (b === 'auto') return 1;
  return a.localeCompare(b);
}
