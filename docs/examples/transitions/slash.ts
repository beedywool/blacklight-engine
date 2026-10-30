// The menu cuts in on a slanted edge; a slanted cover sweeps across between scenes.
import { Graphics, Scene } from '@blacklight/core';
import { defineComponent, h } from 'vue';

const TRANSITION = 'slash';

const Menu = defineComponent(
  () => () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:120px 320px;display:grid;place-content:center;background:#fff;color:#080808;font-size:72px',
      },
      TRANSITION.toUpperCase(),
    ),
);

/** Opens the menu with the transition, closes it, then changes scene under the same effect. */
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
    const menu = this.ui.open(Menu, {}, { enter: TRANSITION, leave: TRANSITION });
    this.after(1400, () => menu.close());
    this.after(2400, () => void this.goto(this.next, undefined, { transition: TRANSITION }));
  }
}

class Other extends Room {
  override color = 0x3a3a3a;
  override next = 'main';
}

export const scenes = { other: Other };
export default Room;
