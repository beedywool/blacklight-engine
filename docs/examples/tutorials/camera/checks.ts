import type { Checks } from '../check';

export const checks: Checks = {
  '1-follow': {
    goal: 'the camera follows the runner',
    done: (game) => game.scene?.camera.following !== undefined,
  },
  '2-smooth': {
    goal: 'the camera follows with a lerp below 1 and a dead zone',
    done: (game) => {
      const settings = game.scene?.camera.followSettings;
      return !!settings && (settings.lerp ?? 1) < 1 && !!settings.deadzone;
    },
  },
  '3-zoom-and-shake': {
    goal: 'the view is zoomed in and Space shakes it',
    keys: ['Space'],
    done: (game) => {
      const camera = game.scene?.camera;
      return (
        !!camera && camera.zoom > 1 && (camera.shakeOffset.x !== 0 || camera.shakeOffset.y !== 0)
      );
    },
  },
};
