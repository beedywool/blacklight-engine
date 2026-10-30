// Two players on one keyboard: arrows and WASD. Each half of the screen follows its player.
import { Graphics, Scene, behaviors, type GameConfig } from '@blacklight/core';

export const config: Partial<GameConfig> = {
  input: {
    actions: {
      // Player one keeps the arrows; the letters become player two's actions.
      left: ['ArrowLeft', 'Pad:Left'],
      right: ['ArrowRight', 'Pad:Right'],
      up: ['ArrowUp', 'Pad:Up'],
      down: ['ArrowDown', 'Pad:Down'],
      p2Left: ['KeyA'],
      p2Right: ['KeyD'],
      p2Up: ['KeyW'],
      p2Down: ['KeyS'],
    },
  },
};

class Runner extends Graphics {
  color = 0xffffff;
  override create() {
    this.draw.circle(0, 0, 28).fill(this.color);
  }
}

class PlayerOne extends Runner {
  static override behaviors = [behaviors.eightDirections({ speed: 420 })];
}

class PlayerTwo extends Runner {
  static override behaviors = [
    behaviors.eightDirections({
      speed: 420,
      actions: { left: 'p2Left', right: 'p2Right', up: 'p2Up', down: 'p2Down' },
    }),
  ];
}

export default class Example extends Scene {
  static override size = { width: 2560, height: 1440 };

  override create() {
    const floor = this.spawn(Graphics);
    floor.draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (let x = 0; x < this.width; x += 160) floor.draw.rect(x, 0, 4, this.height);
    for (let y = 0; y < this.height; y += 160) floor.draw.rect(0, y, this.width, 4);
    floor.draw.fill(0x3a3a3a);

    const one = this.spawn(PlayerOne, { x: 900, y: 720, color: 0xffffff });
    const two = this.spawn(PlayerTwo, { x: 1660, y: 720, color: 0xe60012 });
    this.camera.viewport = { x: 0, y: 0, width: 0.5, height: 1 };
    this.camera.bounds = this.bounds;
    this.camera.follow(one, { lerp: 0.2 });
    const right = this.addCamera({ x: 0.5, y: 0, width: 0.5, height: 1 });
    right.bounds = this.bounds;
    right.follow(two, { lerp: 0.2 });
  }
}
