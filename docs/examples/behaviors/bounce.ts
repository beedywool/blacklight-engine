// Balls bounce off the scene edges and off the grey blocks. Click to add a ball at the pointer.
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Ball extends Graphics {
  override create() {
    this.draw.circle(0, 0, 18).fill(0xffffff);
  }
}

export default class Example extends Scene {
  override create() {
    for (const [x, y, w, h] of [
      [300, 200, 200, 40],
      [760, 420, 40, 200],
      [900, 160, 180, 40],
    ] as const) {
      const block = this.spawn(Graphics, { x, y });
      block.draw.rect(0, 0, w, h).fill(0x3a3a3a);
      block.collision.solid = true;
    }
    for (let i = 0; i < 5; i++) this.addBall(200 + i * 150, 670, 200 + i * 30);
  }

  addBall(x: number, y: number, angle: number) {
    const ball = this.spawn(Ball, { x, y });
    ball.addBehavior(behaviors.bounce({ speed: 360, angle }));
    if (this.objects.length % 2) ball.tint = 0xe60012;
  }

  override update() {
    if (this.pointer.pressed)
      this.addBall(this.pointer.x, this.pointer.y, this.random.float(0, 360));
  }
}
