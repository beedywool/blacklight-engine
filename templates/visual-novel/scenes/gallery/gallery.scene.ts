import { Graphics, Scene } from '@blacklight/core';

/** Unlocked story images (placeholders): a grid; `back` returns to the title. */
export default class Gallery extends Scene {
  override create() {
    this.spawn(Graphics, { zIndex: -1 }).draw.rect(-960, 0, 3840, 1080).fill(0x111111);
    this.ui.open('Gallery', {}, { enter: 'slices' });
  }
}
