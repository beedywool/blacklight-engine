import { Graphics, Scene } from '@blacklight/core';

/** Mini-game cards with their player range and two settings each. */
export default class GameSelect extends Scene {
  override create(): void {
    const floor = this.spawn(Graphics, { zIndex: -1 });
    floor.draw.rect(0, 0, 1920, 1080).fill(0x111111);
    floor.draw.poly([1180, 0, 1920, 0, 1920, 1080, 1060, 1080]).fill(0xe60012);
    for (let i = 0; i < 14; i++)
      floor.draw
        .poly([1180 + i * 60, 0, 1200 + i * 60, 0, 1080 + i * 60, 1080, 1060 + i * 60, 1080])
        .fill({ color: 0x000000, alpha: 0.08 });
    this.ui.open('GameSelectScreen', {}, { enter: 'slash', leave: 'fade' });
  }
}
