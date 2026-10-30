// The rooms change through an iris. Make the menu slash in and out.
import { Graphics, Scene } from '@blacklight/core';
import { defineComponent, h } from 'vue';

const Menu = defineComponent(
  () => () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:120px 320px;display:grid;place-content:center;background:#fff;color:#080808;font-size:72px',
      },
      'MENU',
    ),
);

/** Opens the menu, closes it, then goes to the other room; and again from there. */
class Room extends Scene {
  color = 0x181818;
  next = 'other';

  override create() {
    const backdrop = this.spawn(Graphics);
    backdrop.draw.rect(0, 0, this.width, this.height).fill(this.color);
    backdrop.draw.circle(this.width / 2, this.height / 2, 220).fill(0xe60012);
    const menu = this.ui.open(Menu, {}, { enter: 'slash', leave: 'slash' });
    this.after(1400, () => menu.close());
    this.after(2400, () => void this.goto(this.next, undefined, { transition: 'iris' }));
  }
}

class Other extends Room {
  override color = 0x3a3a3a;
  override next = 'main';
}

export const scenes = { other: Other };
export default Room;
