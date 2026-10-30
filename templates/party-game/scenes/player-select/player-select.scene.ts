import { Graphics, Scene } from '@blacklight/core';

/**
 * Join screen: player 1 has the keyboard, mouse and first gamepad; every other gamepad joins with
 * its confirm button (`input.join`). The screen does the rest (profiles, skins, "READY!").
 */
export default class PlayerSelect extends Scene {
  override create(): void {
    const floor = this.spawn(Graphics, { zIndex: -1 });
    floor.draw.rect(0, 0, 1920, 1080).fill(0x15151b);
    for (let i = 0; i < 24; i++)
      floor.draw.rect(i * 90 - 200, 0, 34, 1080).fill({ color: 0xffffff, alpha: 0.025 });
    this.ui.open('PlayerSelectScreen', {}, { enter: 'slices', leave: 'fade' });
  }
}
