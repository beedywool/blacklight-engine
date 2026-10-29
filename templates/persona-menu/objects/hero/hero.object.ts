import { Graphics, behaviors } from '@blacklight/core';

/** The player: a red-and-black figure moved with the left stick, D-pad, arrows or WASD. */
export default class Hero extends Graphics {
  static override behaviors = [
    behaviors.eightDirections({ speed: 420, acceleration: 3600, deceleration: 4200 }),
  ];
  static override collision = { layer: 'player' };

  override create() {
    this.draw
      .poly([-34, 40, 0, -64, 34, 40])
      .fill(0x111111)
      .poly([-22, 28, 0, -38, 22, 28])
      .fill(0xe60012)
      .circle(0, -76, 18)
      .fill(0xffffff);
  }

  override update() {
    if (this.velocity.x !== 0) this.scale.x = this.velocity.x < 0 ? -1 : 1;
  }
}
