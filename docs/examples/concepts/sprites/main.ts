// Arrows or WASD: the hero plays `run` while moving, `idle` otherwise, and counts its steps.
import { Graphics, Scene, Text } from '@blacklight/core';
import Hero from './objects/hero/hero.object';

export default class Example extends Scene {
  private hero!: Hero;
  private counter!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x303030);
    // Pixel art is drawn 8 times bigger; `pixelArt` in the config keeps it sharp.
    this.hero = this.spawn(Hero, { x: this.width / 2, y: this.height / 2 });
    this.hero.scale.set(8);
    this.counter = this.spawn(Text, {
      x: this.width / 2,
      y: 60,
      text: '',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 36 },
    });
  }

  override update() {
    this.counter.text = `${this.hero.animation} · frame ${this.hero.frame} · ${this.hero.steps} steps`;
  }
}

export const config = {
  resolution: { width: 1280, height: 720, mode: 'letterbox' as const, pixelArt: true },
};
