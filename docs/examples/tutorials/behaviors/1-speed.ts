// Arrows or WASD move the ship, slowly. Make it three times faster.
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Ship extends Graphics {
  static override behaviors = [
    behaviors.eightDirections({ speed: 200, acceleration: 3000, deceleration: 4000 }),
  ];

  override create() {
    this.draw.poly([0, -44, 36, 36, 0, 16, -36, 36]).fill(0xffffff);
  }
}

class Star extends Graphics {
  static override behaviors = [behaviors.sineWave({ property: 'y', amplitude: 30, period: 2 })];

  override create() {
    this.draw.star(0, 0, 5, 40, 18).fill(0xe60012);
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.spawn(Ship, { x: 400, y: 360 });
    this.spawn(Star, { x: 900, y: 360 });
  }
}
