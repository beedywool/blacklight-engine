// Arrows move through a world wider than the screen; Q and E zoom, Space shakes the camera.
import { Graphics, Scene, Text, behaviors } from '@blacklight/core';

class Runner extends Graphics {
  static override behaviors = [behaviors.eightDirections({ speed: 700 })];

  override create() {
    this.draw.circle(0, 0, 30).fill(0xffffff);
  }
}

export default class Example extends Scene {
  // The world size is also the camera's bounds: it never shows past the edges.
  static override size = { width: 4000, height: 1400 };

  override create() {
    const ground = this.spawn(Graphics);
    ground.draw.rect(0, 0, 4000, 1400).fill(0x111111);
    for (let x = 0; x <= 4000; x += 200) {
      ground.draw.rect(x, 0, 6, 1400).fill(x % 1000 === 0 ? 0xe60012 : 0x2c2c2c);
    }
    for (let y = 0; y <= 1400; y += 200) ground.draw.rect(0, y, 4000, 6).fill(0x2c2c2c);
    const runner = this.spawn(Runner, { x: 400, y: 700 });
    this.camera.follow(runner, { lerp: 0.1, deadzone: { width: 200, height: 120 } });
    // HUD objects stay on screen whatever the camera does.
    this.spawn(Text, {
      layer: 'hud',
      x: this.width / 2,
      y: 50,
      text: 'Q / E zoom · Space shake',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });
  }

  override update() {
    if (this.input.pressed('tabLeft'))
      this.tween(this.camera, { zoom: Math.max(0.5, this.camera.zoom - 0.25) }, { duration: 200 });
    if (this.input.pressed('tabRight'))
      this.tween(this.camera, { zoom: Math.min(2, this.camera.zoom + 0.25) }, { duration: 200 });
    if (this.input.pressed('jump')) this.camera.shake(16, 300);
  }
}
