import { Graphics, Scene } from '@blacklight/core';

/** Unlocked story images (placeholders): a grid; `back` returns to the title. */
export default class Gallery extends Scene {
  override create() {
    this.spawn(Graphics, { zIndex: -1 }).draw.rect(-960, -1080, 3840, 3240).fill(0x111111);
    this.ui.open('Gallery', {}, { enter: 'slices' });
  }
}
