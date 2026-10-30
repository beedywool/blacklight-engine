// Space shakes nothing yet, and the view is always at zoom 1: add both.
import { Graphics, Scene, behaviors } from '@blacklight/core';

class Runner extends Graphics {
  static override behaviors = [behaviors.eightDirections({ speed: 700 })];

  override create() {
    this.draw.circle(0, 0, 30).fill(0xffffff);
  }
}

export default class Example extends Scene {
  // The world size, which is also the area the camera stays inside.
  static override size = { width: 4000, height: 1400 };

  override create() {
    const ground = this.spawn(Graphics);
    ground.draw.rect(0, 0, 4000, 1400).fill(0x111111);
    for (let x = 0; x <= 4000; x += 200)
      ground.draw.rect(x, 0, 6, 1400).fill(x % 1000 === 0 ? 0xe60012 : 0x2c2c2c);
    for (let y = 0; y <= 1400; y += 200) ground.draw.rect(0, y, 4000, 6).fill(0x2c2c2c);
    const runner = this.spawn(Runner, { x: 400, y: 700 });
    this.camera.follow(runner, { lerp: 0.1, deadzone: { width: 300, height: 200 } });
    this.camera.zoom = 1.5;
  }

  override update() {
    if (this.input.pressed('jump')) this.camera.shake(16, 300);
  }
}
