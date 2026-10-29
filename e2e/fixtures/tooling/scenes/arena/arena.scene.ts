import { Scene } from '@blacklight/core';
import type Hero from '@objects/hero/hero.object';
import layout from './arena.layout.json';

export default class Arena extends Scene {
  static override assets = ['@assets/arena-bg.png'];
  hero!: Hero;
  ticks = 0;

  override create() {
    this.load(layout);
    this.hero = this.find('Hero') as Hero;
  }

  /** Points per step; the hot reload e2e edits this value. */
  rate() {
    return 1;
  }

  override update() {
    this.ticks += this.rate();
    if (this.input.pressed('fire')) this.ui.push('Menu');
  }
}
