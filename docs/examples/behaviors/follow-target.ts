// Move the white square with the arrows. The pet follows the square and stops 90 px away; the
// missile homes on the mouse pointer (a function target) and turns to face it.
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Player extends Graphics {
  static override behaviors = [behaviors.eightDirections({ speed: 380 })];

  override create() {
    this.draw.rect(-24, -24, 48, 48).fill(0xffffff);
  }
}

export default class Example extends Scene {
  override create() {
    const player = this.spawn(Player, { x: 640, y: 360 });

    const pet = this.spawn(Graphics, { x: 200, y: 200 });
    pet.draw.circle(0, 0, 16).fill(0x8e8e8e);
    pet.addBehavior(behaviors.followTarget({ target: player, speed: 260, stopDistance: 90 }));

    const missile = this.spawn(Graphics, { x: 1100, y: 600 });
    missile.draw.poly([22, 0, -14, -12, -14, 12]).fill(0xe60012);
    missile.addBehavior(
      behaviors.followTarget({
        target: () => ({ x: this.pointer.x, y: this.pointer.y }),
        speed: 200,
        rotate: true,
      }),
    );
  }
}
