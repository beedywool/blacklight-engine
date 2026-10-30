// Arrows or WASD move the dot. Make it grow while Space (the `jump` action) is held.
import { Graphics, Scene, Text } from '@blacklight/core';

class Dot extends Graphics {
  override create() {
    this.draw.circle(0, 0, 28).fill(0xffffff);
  }
}

export default class Example extends Scene {
  private dot!: Dot;
  private info!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.dot = this.spawn(Dot, { x: 300, y: 360 });
    this.info = this.spawn(Text, {
      x: this.width / 2,
      y: 50,
      text: '',
      style: { fill: 0xc2c2c2, fontFamily: 'system-ui, sans-serif', fontSize: 28 },
    });
  }

  override update() {
    // Arrows, WASD, the D-pad or the left stick: a vector of length 0 to 1.
    const move = this.input.vector('left', 'right', 'up', 'down');
    this.dot.x += move.x * 8;
    this.dot.y += move.y * 8;
    this.dot.scale.set(this.input.held('jump') ? 1.5 : 1);
    this.info.text = `last device: ${this.input.lastDevice}`;
  }
}
