import { Graphics, Scene } from '@blacklight/core';

export default class Field extends Scene {
  static override size = { width: 3840, height: 2160 };

  override create() {
    const floor = this.spawn(Graphics, { layer: 'main', zIndex: -1 });
    floor.draw.rect(0, 0, 3840, 2160).fill(0x16161c);
    for (let x = 0; x <= 3840; x += 160) floor.draw.moveTo(x, 0).lineTo(x - 1080, 2160);
    floor.draw.stroke({ color: 0x2a2a33, width: 6 });
    const hero = this.spawn('Hero', { x: 1920, y: 1080 });
    this.camera.follow(hero, { lerp: 0.12 });
    this.ui.open('Hud');
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push('PauseMenu');
  }
}
