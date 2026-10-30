// Run into the red blocks: the screen shakes, the hero blinks and is pushed back, the damage shows.
import { Graphics, Scene, behaviors, type Flash, type GameObject } from '@blacklight/core';
import { damageNumber } from '@blacklight/ui';

class Spike extends Graphics {
  static override behaviors = [behaviors.patrol({ distance: 160, speed: 160, axis: 'y' })];
  override create() {
    this.draw.rect(-30, -30, 60, 60).fill(0xe60012);
  }
}

class Hero extends Graphics {
  static override behaviors = [
    behaviors.eightDirections({ speed: 380 }),
    behaviors.flash({ interval: 70 }),
  ];
  hp = 100;
  override create() {
    this.draw.circle(0, 0, 26).fill(0xffffff);
  }
  override onCollide(other: GameObject) {
    const flash = this.behavior<Flash>('flash')!;
    if (!other.is(Spike) || flash.flashing) return;
    const damage = this.scene.random.int(8, 16);
    this.hp -= damage;
    flash.start(800); // invulnerable while blinking
    this.scene.camera.shake(14, 200);
    damageNumber(this.game, this, damage, { critical: damage > 14 });
    // Knockback: a short tween away from the spike.
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const length = Math.hypot(dx, dy) || 1;
    this.tween(
      { x: this.x + (dx / length) * 90, y: this.y + (dy / length) * 90 },
      { duration: 160 },
    );
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (const x of [400, 640, 880]) this.spawn(Spike, { x, y: this.height / 2 });
    this.spawn(Hero, { x: 200, y: this.height / 2 });
  }
}
