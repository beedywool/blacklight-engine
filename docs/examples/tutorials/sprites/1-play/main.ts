// The hero walks but shows its idle animation (the `default` of hero.anim.json). Play `run`.
import { Graphics, Scene } from '@blacklight/core';
import Hero from './objects/hero/hero.object';

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x303030);
    // The sheet is 16 px per frame: draw it 8 times bigger. `pixelArt` keeps it sharp.
    this.spawn(Hero, { x: 300, y: 400 }).scale.set(8);
  }
}

export const config = {
  resolution: { width: 1280, height: 720, mode: 'letterbox' as const, pixelArt: true },
};
