import type { Game } from '@blacklight/core';
import { find, type Checks } from '../check';

/** Options of a behavior of the first object of a class. */
const options = (game: Game, object: string, behavior: string) =>
  (find(game, object)?.behavior(behavior) as { options?: Record<string, unknown> } | undefined)
    ?.options;

export const checks: Checks = {
  '1-speed': {
    goal: 'the ship moves at 600 px/s',
    done: (game) => options(game, 'Ship', 'eightDirections')?.speed === 600,
  },
  '2-wrap': {
    goal: 'the ship has the wrapAroundScreen behavior',
    done: (game) => !!find(game, 'Ship')?.behavior('wrapAroundScreen'),
  },
  '3-enabled': {
    goal: 'Space turns the sine wave of the star off',
    keys: ['Space'],
    done: (game) => find(game, 'Star')?.behavior('sineWave')?.enabled === false,
  },
  '4-custom': {
    goal: 'the star turns',
    done: (game) => (find(game, 'Star')?.rotation ?? 0) !== 0,
  },
};
