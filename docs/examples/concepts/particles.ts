// A fountain emits continuously; click to burst sparks where you click.
import { Graphics, Particles, Scene } from '@blacklight/core';

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x0d0d0d);
    const fountain = this.spawn(Particles, { x: this.width / 2, y: this.height - 80 });
    fountain.configure({
      rate: 120,
      lifetime: [900, 1400],
      speed: [500, 700],
      angle: [255, 285],
      gravity: { x: 0, y: 900 },
      scale: [1.4, 0.3],
      tint: [0xffffff, 0x8e8e8e],
    });
  }

  override update() {
    if (!this.pointer.pressed) return;
    const sparks = this.spawn(Particles, { x: this.pointer.x, y: this.pointer.y });
    sparks.configure({
      rate: 0,
      speed: [200, 520],
      tint: [0xffd60a, 0xe60012],
      additive: true,
      scale: [1.6, 0],
    });
    sparks.burst(60);
    this.after(1500, () => sparks.destroy());
  }
}
