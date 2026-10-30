import { find, findAll, type Checks } from '../check';

export const checks: Checks = {
  '1-pickup': {
    goal: 'a coin disappears when the square touches it',
    keys: ['ArrowRight'],
    done: (game) => findAll(game, 'Coin').length < 3,
  },
  '2-solid': {
    goal: 'the wall stops the square while it pushes right',
    keys: ['ArrowRight'],
    done: (game) => {
      const player = find(game, 'Player');
      const wall = find(game, 'Wall');
      return (
        !!player &&
        !!wall &&
        game.input.held('right') &&
        player.velocity.x === 0 &&
        player.x < wall.x &&
        player.x > wall.x - 100
      );
    },
  },
  '3-spikes': {
    goal: 'the spikes destroy the square',
    keys: ['ArrowDown'],
    done: (game) => game.scene?.name === 'main' && !find(game, 'Player'),
  },
};
