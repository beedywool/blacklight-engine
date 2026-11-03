import { Graphics, Scene } from '@blacklight/core';
import { floatText } from '@blacklight/ui';
import Lantern from '@objects/lantern/lantern.object';

export default class Title extends Scene {
  lantern!: Lantern;
  clicks = 0;

  override create() {
    const sky = this.spawn(Graphics, { zIndex: -1 });
    // `extend` shows more than 1920×1080 on other aspect ratios: the first and last colors run
    // past every edge.
    sky.draw.rect(-960, -1080, 3840, 1170).fill(0x3a1024);
    sky.draw.rect(-960, 1080, 3840, 1080).fill(0x08080c);
    // Bands of a dusk gradient and a skyline: the FX layer's halftone turns them into print dots.
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const color = (Math.round(0x3a - 0x2a * t) << 16) | (Math.round(0x10 * (1 - t)) << 8) | 0x24;
      sky.draw.rect(-960, i * 90, 3840, 92).fill(color);
    }
    for (let i = 0; i < 16; i++) {
      const h = 160 + ((i * 131) % 340);
      sky.draw.rect(-480 + i * 190, 1080 - h, 170, h).fill(0x08080c);
    }
    this.lantern = this.spawn(Lantern, { x: 1420, y: 430 });
    this.ui.open('TitleScreen', { lantern: this.lantern }, { enter: 'slash', leave: 'fade' });
    // Global assets load on demand: fetch the theme, then play it.
    void this.game.assets
      .load(this.game.audio.resolve('theme'))
      .then(() => this.audio.music('theme', { fade: 800 }));
  }

  override update() {
    const pointer = this.pointer;
    if (pointer.pressed && this.lantern.contains(pointer.x, pointer.y)) {
      this.clicks++;
      floatText(this.game, this.lantern, `+${this.clicks}`, {
        color: '#ffd60a',
        offset: { x: 0, y: -110 },
      });
    }
  }
}
