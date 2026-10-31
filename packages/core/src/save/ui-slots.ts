import type { SaveData } from './config';
import type { SaveMeta } from './format';
import type { SaveManager } from './manager';

/** A slot as the UI's save/load screens list it (`SaveSlotInfo` of `@blacklight/ui`). */
export interface ScreenSlotInfo {
  /** Slot name. */
  id: string;
  /** When it was written, ms since the epoch. */
  savedAt: number;
  /** Free text (chapter, place). */
  label?: string;
  /** One line of detail (last line of dialogue, party level). */
  summary?: string;
  /** Small image of the game (data URL). */
  thumbnail?: string;
  /** Play time in seconds. */
  playTime?: number;
}

/** What the screens store with a slot besides its data. */
export type ScreenSlotMeta = Omit<ScreenSlotInfo, 'id' | 'savedAt'>;

/** The `SaveSlots` interface of `@blacklight/ui`, implemented over `game.save`. */
export interface ScreenSlots {
  /** Slots that can be loaded (directly or from their backup). */
  list(): Promise<ScreenSlotInfo[]>;
  /** Saves the current game into slot `id`. */
  save(id: string, meta: ScreenSlotMeta): Promise<void>;
  /** Loads slot `id`, falling back to its backup when the file was modified or damaged. */
  load(id: string): Promise<void>;
  /** Deletes slot `id`. */
  delete(id: string): Promise<void>;
}

/** Options of {@link screenSlots}: extra state to store and how to resume after a load. */
export interface ScreenSlotsOptions {
  /** Extra state to store before each save (`{ dialogue: dialogue.state() }`), merged into `save.data`. */
  collect?(): Partial<SaveData> | Promise<Partial<SaveData>>;
  /** Called after a load with the data (go to the right scene, `dialogue.restore(…)`). */
  apply?(data: SaveData, info: ScreenSlotInfo): void | Promise<void>;
}

/**
 * Adapts `game.save` to the UI's ready-made save/load screens, so they use the encrypted, signed
 * saves with backups. A slot whose file was modified loads its backup instead when there is one.
 *
 * @example
 * ```ts
 * const slots = screenSlots(this.game.save, {
 *   collect: () => ({ dialogue: dialogue.state() }),
 *   apply: (data) => this.game.goto('story', { dialogue: data.dialogue }),
 * });
 * this.ui.push(SaveLoadScreen, { slots, mode: 'save' });
 * ```
 */
export function screenSlots(save: SaveManager, options: ScreenSlotsOptions = {}): ScreenSlots {
  const info = (slot: string, meta: SaveMeta): ScreenSlotInfo => ({
    id: slot,
    savedAt: meta.date,
    ...(meta.label ? { label: meta.label } : {}),
    ...(meta.summary ? { summary: meta.summary } : {}),
    ...(meta.thumbnail ? { thumbnail: meta.thumbnail } : {}),
    playTime: Math.round(meta.playTime / 1000),
  });
  return {
    async list() {
      return (await save.list())
        .filter((slot) => slot.meta && (slot.status === 'ok' || slot.hasBackup))
        .map((slot) => info(slot.slot, slot.meta!));
    },
    async save(id, meta) {
      if (options.collect) Object.assign(save.data, await options.collect());
      await save.save(id, {
        label: meta.label,
        summary: meta.summary,
        thumbnail: meta.thumbnail ?? true,
      });
    },
    async load(id) {
      try {
        await save.load(id);
      } catch (error) {
        if (!(error as { hasBackup?: boolean }).hasBackup) throw error;
        await save.load(id, { backup: true });
      }
      const meta = (await save.list()).find((s) => s.slot === save.slot)?.meta ?? {
        date: Date.now(),
        playTime: save.playTime,
      };
      await options.apply?.(save.data, info(id, meta));
    },
    async delete(id) {
      await save.delete(id);
    },
  };
}
