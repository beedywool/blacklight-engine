import { Graphics, Scene } from '@blacklight/core';

/** Podium and points of the last match, with the totals of the party. */
export default class Results extends Scene {
  static override assets = ['@assets/sfx/'];

  override create(): void {
    const floor = this.spawn(Graphics, { zIndex: -1 });
    floor.draw.rect(0, 0, 1920, 1080).fill(0x101018);
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      floor.draw
        .poly([
          700,
          620,
          700 + Math.cos(angle) * 2000,
          620 + Math.sin(angle) * 2000,
          700 + Math.cos(angle + 0.12) * 2000,
          620 + Math.sin(angle + 0.12) * 2000,
        ])
        .fill({ color: 0xffd60a, alpha: 0.06 });
    }
    this.ui.open('ResultsScreen', {}, { enter: 'slices', leave: 'fade' });
    this.audio.play('finish');
  }
}
