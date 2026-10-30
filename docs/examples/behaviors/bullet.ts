// The turret aims at the mouse and fires twice a second. Bolts fly straight; every third shot is a
// grenade that falls with gravity. Both are destroyed when they hit the wall (destroyOnSolid).
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Bolt extends Graphics {
  static override behaviors = [
    behaviors.bullet({ speed: 700, rotate: true }),
    behaviors.destroyOutsideLayout(),
  ];

  override create() {
    this.draw.rect(-14, -4, 28, 8).fill(0xffffff);
  }
}

class Grenade extends Graphics {
  static override behaviors = [
    behaviors.bullet({ speed: 620, gravity: 900 }),
    behaviors.destroyOutsideLayout(),
  ];

  override create() {
    this.draw.circle(0, 0, 10).fill(0xe60012);
  }
}

export default class Example extends Scene {
  turret!: Graphics;
  shots = 0;

  override create() {
    const wall = this.spawn(Graphics, { x: 1100, y: 120 });
    wall.draw.rect(0, 0, 40, 480).fill(0x3a3a3a);
    wall.collision.solid = true;

    this.turret = this.spawn(Graphics, { x: 180, y: 520 });
    this.turret.draw.rect(0, -10, 60, 20).fill(0x8e8e8e).circle(0, 0, 30).fill(0xffffff);
    this.every(500, () => this.fire());
  }

  fire() {
    const { x, y, rotation } = this.turret;
    // The bullet reads its direction from `rotation` when it attaches, after spawn props.
    const Type = ++this.shots % 3 === 0 ? Grenade : Bolt;
    this.spawn(Type, { x: x + Math.cos(rotation) * 60, y: y + Math.sin(rotation) * 60, rotation });
  }

  override update() {
    this.turret.rotation = Math.atan2(
      this.pointer.y - this.turret.y,
      this.pointer.x - this.turret.x,
    );
  }
}
