import { Graphics, Scene, Text } from '@blacklight/core';
import Hero from '@objects/hero/hero.object';

export default class Field extends Scene {
  override create() {
    const floor = this.spawn(Graphics, { zIndex: -1 });
    floor.draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (let x = 0; x < this.width; x += 120) floor.draw.rect(x, 0, 2, this.height);
    for (let y = 0; y < this.height; y += 120) floor.draw.rect(0, y, this.width, 2);
    floor.draw.fill(0x2c2c2c);

    this.spawn(Hero, { x: this.width / 2, y: this.height / 2, scale: 6 });
    this.spawn(Text, {
      x: this.width / 2,
      y: this.height - 80,
      text: 'Arrows or WASD to move, Escape for the menu',
      style: { fill: 0x8e8e8e, fontFamily: 'system-ui, sans-serif', fontSize: 36 },
    });
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push('PauseMenu');
  }
}
