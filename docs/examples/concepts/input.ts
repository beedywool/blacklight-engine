// Arrows/WASD or a gamepad move the dot (vector), J or a click fires (custom action), held keys light up.
import { Graphics, Scene, Text, type GameConfig } from '@blacklight/core';

// Actions are named in the config; these bindings are added to the defaults.
export const config: Partial<GameConfig> = {
  input: { actions: { fire: ['KeyJ', 'Mouse:Left', 'Pad:RT'] } },
};

const SHOWN = ['left', 'right', 'up', 'down', 'jump', 'fire'] as const;

export default class Example extends Scene {
  private dot!: Graphics;
  private keys: Graphics[] = [];
  private info!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.dot = this.spawn(Graphics, { x: this.width / 2, y: this.height / 2 });
    this.dot.draw.circle(0, 0, 28).fill(0xffffff);
    SHOWN.forEach((action, i) => {
      const key = this.spawn(Graphics, { layer: 'hud', x: 160 + i * 190, y: 640 });
      key.draw.roundRect(-80, -30, 160, 60, 16).fill(0xffffff);
      this.spawn(Text, {
        layer: 'hud',
        x: key.x,
        y: key.y,
        text: action,
        style: { fill: 0x080808, fontFamily: 'system-ui, sans-serif', fontSize: 28 },
      });
      this.keys.push(key);
    });
    this.info = this.spawn(Text, {
      layer: 'hud',
      x: this.width / 2,
      y: 50,
      text: '',
      style: { fill: 0xc2c2c2, fontFamily: 'system-ui, sans-serif', fontSize: 28 },
    });
  }

  override update() {
    // A vector of length 0 to 1: keys give full steps, sticks give analog values.
    const move = this.input.vector('left', 'right', 'up', 'down');
    this.dot.x += move.x * 8;
    this.dot.y += move.y * 8;
    SHOWN.forEach((action, i) => (this.keys[i]!.alpha = this.input.held(action) ? 1 : 0.25));
    if (this.input.pressed('fire') || this.pointer.pressed) {
      const ring = this.spawn(Graphics, { x: this.pointer.x, y: this.pointer.y });
      ring.draw.circle(0, 0, 40).stroke({ color: 0xe60012, width: 6 });
      ring.tween({ alpha: 0 }, { duration: 500 }).finished.then(() => ring.destroy());
    }
    this.info.text = `last device: ${this.input.lastDevice}   axis x: ${this.input.axis('left', 'right').toFixed(2)}`;
  }
}
