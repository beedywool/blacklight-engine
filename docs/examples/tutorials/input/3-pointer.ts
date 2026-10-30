// The mouse does nothing yet. Move the dot to where the player clicks or touches.
import { Graphics, Scene, Text, type GameConfig } from '@blacklight/core';

// Actions are named in the game config; these bindings come on top of the defaults.
export const config: Partial<GameConfig> = {
  input: { actions: { dash: ['KeyC', 'Pad:B'] } },
};

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
    if (this.input.pressed('dash')) this.dot.x += 200;
    this.info.text = `last device: ${this.input.lastDevice}`;
  }
}
