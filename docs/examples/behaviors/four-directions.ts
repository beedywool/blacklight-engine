// Arrows or WASD move the knight on one axis at a time; the stronger input wins.
import { Graphics, Scene, behaviors, type FourDirections } from '@blacklight/core';

const ANGLES: Record<string, number> = { up: 0, right: 90, down: 180, left: 270 };

class Knight extends Graphics {
  static override behaviors = [behaviors.fourDirections({ speed: 320 })];

  override create() {
    this.draw.rect(-28, -28, 56, 56).fill(0xffffff);
    // The notch shows `facing`: right, down, left or up.
    this.draw.rect(-6, -28, 12, 20).fill(0xe60012);
  }

  override update() {
    const move = this.behavior<FourDirections>('fourDirections')!;
    this.angle = ANGLES[move.facing] ?? 0;
  }
}

export default class Example extends Scene {
  override create() {
    const floor = this.spawn(Graphics);
    for (let x = 0; x < this.width; x += 80)
      for (let y = 0; y < this.height; y += 80)
        if ((x + y) % 160 === 0) floor.draw.rect(x, y, 80, 80).fill(0x181818);
    this.spawn(Knight, { x: this.width / 2, y: this.height / 2 });
  }
}
