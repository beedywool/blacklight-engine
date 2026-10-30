import { Graphics, Scene } from '@blacklight/core';
import Hero from '@objects/hero/hero.object';
import { reactive } from 'vue';

/** A field with coins: collect them all. Escape opens the menu. */
export default class Main extends Scene {
  static override size = { width: 960, height: 540 };
  readonly score = reactive({ coins: 0, total: 12 });

  override create() {
    const floor = this.spawn(Graphics, { zIndex: -1 });
    floor.draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (let x = 0; x <= this.width; x += 40) floor.draw.rect(x, 0, 1, this.height);
    for (let y = 0; y <= this.height; y += 40) floor.draw.rect(0, y, this.width, 1);
    floor.draw.fill(0x2c2c2c);

    for (let i = 0; i < this.score.total; i++) {
      this.spawn('Coin', {
        x: 60 + this.random.int(0, this.width - 120),
        y: 60 + this.random.int(0, this.height - 120),
      });
    }
    const hero = this.spawn(Hero, { x: this.width / 2, y: this.height / 2, scale: 3 });
    this.camera.follow(hero, { lerp: 0.15 });
    this.events.on('coin', (coins) => (this.score.coins = coins as number));
    this.ui.open('Hud', { score: this.score });
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push('Menu');
  }
}
