import { findAll, type Checks } from '../check';

export const checks: Checks = {
  '1-spawn': {
    goal: 'three planets or more',
    done: (game) => findAll(game, 'Planet').length >= 3,
  },
  '2-update': {
    goal: 'a planet turns',
    done: (game) => findAll(game, 'Planet').some((planet) => planet.rotation !== 0),
  },
  '3-children': {
    goal: 'a planet is the child of another planet',
    done: (game) => {
      const planets = findAll(game, 'Planet');
      return planets.some((planet) => planets.some((other) => other === planet.parent));
    },
  },
};
