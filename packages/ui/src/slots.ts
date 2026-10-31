import type { Game } from '@blacklight/core';

/** What the save/load screen shows for one slot. */
export interface SaveSlotInfo {
  /** Slot id (`'1'`, `'auto'`, `'quick'`). */
  id: string;
  /** When it was written, ms since the epoch. */
  savedAt: number;
  /** Chapter or place name. */
  label?: string;
  /** One line of detail (last line of dialogue, party level…). */
  summary?: string;
  /** Screenshot as a data URL (see {@link captureThumbnail}). */
  thumbnail?: string;
  /** Play time in seconds. */
  playTime?: number;
}

/** What the game stores with a slot, besides its data. */
export type SaveSlotMeta = Omit<SaveSlotInfo, 'id' | 'savedAt'>;

/**
 * The save system as the ready-made save/load screen sees it. Implement it over `game.save` (or
 * any storage) and pass it to `<SaveLoadScreen :slots>` and `<PauseScreen :slots>`.
 *
 * @example
 * ```ts
 * const slots: SaveSlots = {
 *   list: () => myStore.list(),
 *   save: (id, meta) => myStore.write(id, { meta, data: collect() }),
 *   load: async (id) => apply((await myStore.read(id)).data),
 *   delete: (id) => myStore.remove(id),
 * };
 * ```
 */
export interface SaveSlots {
  /** Filled slots. */
  list(): Promise<SaveSlotInfo[]>;
  /** Writes the current game into slot `id`. */
  save(id: string, meta: SaveSlotMeta): Promise<void>;
  /** Restores slot `id` (usually by going to a scene with its data). */
  load(id: string): Promise<void>;
  /** Empties slot `id`. */
  delete(id: string): Promise<void>;
}

/** Options of {@link fileSlots}. */
export interface FileSlotsOptions<T> {
  /** Returns the data to save (scene state, `dialogue.state()`…), JSON-serializable. */
  collect(): T | Promise<T>;
  /** Applies loaded data (go to the right scene with it). */
  apply(data: T, info: SaveSlotInfo): void | Promise<void>;
  /** Folder in the platform's data files. @defaultValue `'slots'` */
  folder?: string;
  /** Adds details to each save (label, summary, thumbnail). */
  describe?(data: T): SaveSlotMeta | Promise<SaveSlotMeta>;
}

/**
 * Plain JSON slots in the platform's data folder (`game.platform.files`): no encryption, no
 * integrity check. Use it to prototype; production games give the screens an adapter over
 * `game.save`, which encrypts and verifies saves.
 *
 * @example
 * ```ts
 * const slots = fileSlots(game, {
 *   collect: () => ({ dialogue: dialogue.state() }),
 *   apply: (data) => game.goto('story', { restore: data }),
 * });
 * ```
 */
export function fileSlots<T>(
  game: Pick<Game, 'platform'>,
  options: FileSlotsOptions<T>,
): SaveSlots {
  const folder = options.folder ?? 'slots';
  const files = () => game.platform.files;
  const file = (id: string) => {
    if (!/^[\w-]{1,40}$/.test(id))
      throw new Error(`Invalid slot id "${id}": use letters, digits, - and _ (up to 40).`);
    return `${folder}/${id}.json`;
  };
  const read = async (id: string) => {
    const bytes = await files().read(file(id));
    if (!bytes) throw new Error(`Slot "${id}" is empty.`);
    return JSON.parse(new TextDecoder().decode(bytes)) as { info: SaveSlotInfo; data: T };
  };
  return {
    async list() {
      const paths = await files().list(`${folder}/`);
      const infos: SaveSlotInfo[] = [];
      for (const path of paths) {
        const id = path.slice(folder.length + 1).replace(/\.json$/, '');
        try {
          infos.push((await read(id)).info);
        } catch {
          // A broken file shows as an empty slot rather than hiding every other one.
        }
      }
      return infos.sort((a, b) => b.savedAt - a.savedAt);
    },
    async save(id, meta) {
      const data = await options.collect();
      const described = (await options.describe?.(data)) ?? {};
      const info: SaveSlotInfo = { ...described, ...meta, id, savedAt: Date.now() };
      await files().write(file(id), new TextEncoder().encode(JSON.stringify({ info, data })));
    },
    async load(id) {
      const { info, data } = await read(id);
      await options.apply(data, info);
    },
    async delete(id) {
      await files().remove(file(id));
    },
  };
}

/**
 * A small screenshot of the game canvas (not the DOM UI) as a JPEG data URL, for slot thumbnails.
 *
 * @example
 * ```ts
 * slots.save('1', { thumbnail: await captureThumbnail(game) });
 * ```
 */
export async function captureThumbnail(
  game: Pick<Game, 'app' | 'world'>,
  width = 320,
): Promise<string | undefined> {
  try {
    const canvas = game.app.renderer.extract.canvas(game.app.stage) as HTMLCanvasElement;
    const out = document.createElement('canvas');
    out.width = width;
    out.height = Math.round((canvas.height / canvas.width) * width);
    out.getContext('2d')?.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}
