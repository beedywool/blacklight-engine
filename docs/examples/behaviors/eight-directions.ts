// Arrows or WASD move the ship in eight directions; it accelerates and slows down smoothly.
import { Graphics, Scene, behaviors, type EightDirections } from '@blacklight/core';

class Ship extends Graphics {
  static override behaviors = [
    behaviors.eightDirections({ speed: 600, acceleration: 3000, deceleration: 4000 }),
  ];

  override create() {
    this.draw.poly([0, -44, 36, 36, 0, 16, -36, 36]).fill(0xffffff);
  }

  override update() {
    // `facing` names the last direction moved: 'up', 'upright', 'right'…
    const move = this.behavior<EightDirections>('eightDirections')!;
    const angles = {
      right: 90,
      downright: 135,
      down: 180,
      downleft: 225,
      left: 270,
      upleft: 315,
      up: 0,
      upright: 45,
    };
    this.angle = angles[move.facing];
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Ship, { x: this.width / 2, y: this.height / 2 });
  }
}
