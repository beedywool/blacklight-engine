import type { Checks } from '../check';

export const checks: Checks = {
  '1-push': {
    goal: 'Escape opens the pause menu',
    keys: ['Escape'],
    done: (_game, document) => !!document.querySelector('.bl-menu__item'),
  },
  '2-slider': {
    goal: 'the pause menu has a slider',
    keys: ['Escape'],
    done: (_game, document) => !!document.querySelector('.bl-slider'),
  },
  '3-gauge': {
    goal: 'the HUD shows a gauge',
    done: (_game, document) => !!document.querySelector('.bl-gauge'),
  },
};
