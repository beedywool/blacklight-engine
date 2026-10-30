// Left and right turn the turret, hold Space to fire. Bullets break the crates and leave the scene.
import { Graphics, Scene, behaviors, type GameObject } from '@blacklight/core';

class Bullet extends Graphics {
  static override collision = { layer: 'bullet', mask: ['crate'] };
  static override behaviors = [
    behaviors.bullet({ speed: 900, destroyOnSolid: false }),
    behaviors.destroyOutsideLayout({ margin: 20 }),
  ];
  override create() {
    this.draw.circle(0, 0, 6).fill(0xffffff);
  }
}

class Crate extends Graphics {
  static override collision = { layer: 'crate' };
  override create() {
    this.draw.rect(-28, -28, 56, 56).fill(0x8e8e8e).rect(-20, -20, 40, 40).fill(0x3a3a3a);
  }
  override onCollide(other: GameObject) {
    if (!other.is(Bullet)) return;
    other.destroy();
    this.destroy();
  }
}

class Turret extends Graphics {
  private cooldown = 0;
  override create() {
    this.draw.rect(0, -8, 56, 16).fill(0xe60012).circle(0, 0, 28).fill(0xffffff);
  }
  override update() {
    this.angle += this.input.axis('left', 'right') * 3;
    this.cooldown -= 1;
    if (this.input.held('jump') && this.cooldown <= 0) {
      this.cooldown = 8; // steps: 60 per second, so 7.5 shots per second
      const bullet = this.scene.spawn(Bullet, { x: this.x, y: this.y, angle: this.angle });
      bullet.move(Math.cos(this.rotation) * 50, Math.sin(this.rotation) * 50);
    }
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.spawn(Turret, { x: this.width / 2, y: this.height / 2, angle: -90 });
    this.every(700, () => {
      const side = this.random.int(0, 3);
      const x = side < 2 ? this.random.int(80, this.width - 80) : side === 2 ? 80 : this.width - 80;
      const y =
        side >= 2 ? this.random.int(80, this.height - 80) : side === 0 ? 80 : this.height - 80;
      if (this.objects.filter((o) => o.is(Crate)).length < 12) this.spawn(Crate, { x, y });
    });
  }
}
