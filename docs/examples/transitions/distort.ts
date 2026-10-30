// Scene changes only: the picture waves and splits red and blue while black fades in (FX layer).
import { Graphics, Scene } from '@blacklight/core';

const TRANSITION = 'distort';

/** Changes scene every 1.5 s under the transition. */
class Room extends Scene {
  color = 0x181818;
  next = 'other';

  override create() {
    const backdrop = this.spawn(Graphics);
    backdrop.draw.rect(0, 0, this.width, this.height).fill(this.color);
    for (let x = -720; x < this.width; x += 160)
      backdrop.draw
        .poly([x, this.height, x + 80, this.height, x + 800, 0, x + 720, 0])
        .fill(0xe60012);
    this.after(1500, () => void this.goto(this.next, undefined, { transition: TRANSITION }));
  }
}

class Other extends Room {
  override color = 0x3a3a3a;
  override next = 'main';
}

export const scenes = { other: Other };
export default Room;
