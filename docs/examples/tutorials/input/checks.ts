import { find, type Checks } from '../check';

export const checks: Checks = {
  '1-held': {
    goal: 'the dot grows while Space is held',
    keys: ['Space'],
    done: (game) => (find(game, 'Dot')?.scale.x ?? 1) > 1,
  },
  '2-action': {
    goal: 'a dash action exists and C moves the dot to the right',
    keys: ['KeyC'],
    done: (game) => game.input.hasAction('dash') && (find(game, 'Dot')?.x ?? 0) >= 450,
  },
  '3-pointer': {
    goal: 'a click moves the dot',
    done: (game) => (find(game, 'Dot')?.x ?? 0) >= 450,
  },
};
