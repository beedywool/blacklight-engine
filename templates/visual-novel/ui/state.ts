// Shared by the scenes and screens: the story in every language, save slots and the gallery.
import type { Game } from '@blacklight/core';
import { fileSlots, type DialogueState, type SaveSlots } from '@blacklight/ui';
import ar from '@stories/ar/main.ink';
import en from '@stories/en/main.ink';
import ja from '@stories/ja/main.ink';

/** The story by language; the dialogue follows the UI language. */
export const stories = { en, ja, ar };

/** What a save holds: the Ink state (variables, position, backlog) and the background. */
export interface StorySave {
  dialogue: DialogueState;
  background: string;
  player: string;
}

/** A scene that can be saved (the story scene). */
export interface Saveable {
  saveData(): StorySave;
  summary(): { label: string; summary: string };
}

const isSaveable = (scene: unknown): scene is Saveable =>
  typeof (scene as Partial<Saveable> | undefined)?.saveData === 'function';

/**
 * Save slots as plain JSON files through `fileSlots` (the ready-made save/load screen plugs into
 * any `SaveSlots`; swap this for an adapter over `game.save` to get encrypted saves).
 */
export function slotsFor(game: Game): SaveSlots {
  return fileSlots<StorySave>(game, {
    collect: () => {
      if (!isSaveable(game.scene)) throw new Error('Nothing to save outside the story.');
      return game.scene.saveData();
    },
    describe: () => (isSaveable(game.scene) ? game.scene.summary() : {}),
    apply: (data) => game.goto('story', { restore: data }, { transition: 'fade' }),
  });
}

/** Gallery images, in order; each unlocks with `# unlock: <id>` in the story. */
export const GALLERY = ['street', 'rooftop', 'night'] as const;
const UNLOCKED = 'gallery.unlocked';

export function unlocked(game: Game): string[] {
  return game.settings.get<string[]>(UNLOCKED) ?? [];
}

export function unlock(game: Game, id: string): void {
  const list = unlocked(game);
  if (!list.includes(id)) game.settings.set(UNLOCKED, [...list, id]);
}
