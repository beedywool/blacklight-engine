// Split screen: WASD moves the white player (left view), the arrows move the red one (right view).
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Player extends Graphics {
  color = 0xffffff;

  override create() {
    this.draw.circle(0, 0, 36).fill(this.color);
  }
}

export default class Example extends Scene {
  static override size = { width: 3000, height: 2000 };

  override create() {
    const floor = this.spawn(Graphics);
    floor.draw.rect(0, 0, 3000, 2000).fill(0x181818);
    for (let i = 0; i < 60; i++) {
      floor.draw
        .circle(this.random.int(0, 3000), this.random.int(0, 2000), this.random.int(10, 60))
        .fill(0x303030);
    }
    const one = this.spawn(Player, { x: 800, y: 1000 });
    one.addBehavior(
      behaviors.eightDirections({
        speed: 600,
        actions: { left: 'p1Left', right: 'p1Right', up: 'p1Up', down: 'p1Down' },
      }),
    );
    const two = this.spawn(Player, { x: 2200, y: 1000, color: 0xe60012 });
    two.addBehavior(
      behaviors.eightDirections({
        speed: 600,
        actions: { left: 'p2Left', right: 'p2Right', up: 'p2Up', down: 'p2Down' },
      }),
    );

    // Viewports are fractions of the screen; up to 4 cameras.
    this.camera.viewport = { x: 0, y: 0, width: 0.5, height: 1 };
    this.camera.follow(one);
    this.addCamera({ x: 0.5, y: 0, width: 0.5, height: 1 }).follow(two);
    // The HUD is drawn once, over every view.
    this.spawn(Graphics, { layer: 'hud' })
      .draw.rect(this.width / 2 - 4, 0, 8, this.height)
      .fill(0x080808);
  }
}

export const config = {
  input: {
    actions: {
      p1Left: ['KeyA'],
      p1Right: ['KeyD'],
      p1Up: ['KeyW'],
      p1Down: ['KeyS'],
      p2Left: ['ArrowLeft'],
      p2Right: ['ArrowRight'],
      p2Up: ['ArrowUp'],
      p2Down: ['ArrowDown'],
    },
  },
};
