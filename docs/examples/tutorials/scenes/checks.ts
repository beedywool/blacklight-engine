import type { Checks } from '../check';

export const checks: Checks = {
  '1-auto-start': {
    goal: 'the level starts without a key press',
    done: (game) => game.scene?.name === 'level',
  },
  '2-parameters': {
    goal: 'level 3 is running',
    done: (game) =>
      game.scene?.name === 'level' && (game.scene.params as { number?: number }).number === 3,
  },
  '3-overlay': {
    goal: 'the results scene opens over the level',
    done: (game) =>
      game.scene?.name === 'level' && game.overlays.some(({ scene }) => scene.name === 'results'),
  },
};
