// The automatic check of a tutorial exercise. Each tutorial folder has a `checks.ts` that maps
// exercise files (`1-follow`) to a check; the docs page polls it while the preview runs and says
// "Done" once it returns true. Checks read the running game, never the code, so any working
// solution passes. The docs test runs each one on the starting file (must stay false) and on the
// solution file (must turn true).
import type { Game, GameObject } from '@blacklight/core';

export interface Check {
  /** What the check looks for, shown under the task: "the camera follows the runner". */
  goal: string;
  /** True once the task is done. Called four times per second while the preview runs. */
  done(game: Game, document: Document): boolean;
  /**
   * Keys the reader presses to see the result (`KeyboardEvent.code` names); the docs test holds
   * them, one after the other, while it waits.
   */
  keys?: string[];
}

export type Checks = Record<string, Check>;

/** A live object seen by a check: its class's fields are read by name. */
export type Live = GameObject & Record<string, unknown>;

/** First live object of a class (or with that tag). */
export function find(game: Game, name: string): Live | undefined {
  return game.scene?.find(name) as Live | undefined;
}

/** Every live object of a class (or with that tag). */
export function findAll(game: Game, name: string): Live[] {
  return (game.scene?.findAll(name) ?? []) as Live[];
}
