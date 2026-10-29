import type { Game } from '@blacklight/core';

/** Ticker priority after the game draws (Pixi's `UPDATE_PRIORITY.LOW`). */
const AFTER_DRAW = -25;

/**
 * Runs `callback` every displayed frame after the game moved its objects, so UI that follows the
 * world (anchors, floating texts) is never a frame behind. Returns the function that stops it.
 */
export function onAfterDraw(game: Pick<Game, 'app' | 'events'>, callback: () => void): () => void {
  const ticker = (game.app as Partial<Game['app']> | undefined)?.ticker;
  if (ticker) {
    ticker.add(callback, undefined, AFTER_DRAW);
    return () => ticker.remove(callback);
  }
  return game.events.on('frame', callback);
}
