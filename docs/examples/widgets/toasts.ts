// A toast every 1.2 s in the bottom-right corner: info, success, then error (longer). They never take the focus.
import { Graphics, Scene } from '@blacklight/core';
import { toast } from '@blacklight/ui';

const messages = [
  () => toast('Autosaving…'),
  () => toast('Game saved', { kind: 'success' }),
  () => toast('No space left', { kind: 'error', duration: 4000 }),
];

export default class Example extends Scene {
  override create() {
    const backdrop = this.spawn(Graphics);
    backdrop.draw.rect(0, 0, this.width, this.height).fill(0x181818);
    backdrop.draw.circle(this.width / 2, this.height / 2, 120).fill(0x303030);
    let next = 0;
    this.every(1200, () => messages[next++ % messages.length]!());
  }
}
