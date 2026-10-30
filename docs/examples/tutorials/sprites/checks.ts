import { find, type Checks } from '../check';

export const checks: Checks = {
  '1-play': {
    goal: 'the hero plays run',
    done: (game) => find(game, 'Hero')?.animation === 'run',
  },
  '2-flip': {
    goal: 'the hero is mirrored on its way left',
    done: (game) => find(game, 'Hero')?.flipX === true,
  },
  '3-jump': {
    goal: 'the hero plays jump in the air',
    done: (game) => find(game, 'Hero')?.animation === 'jump',
  },
};
