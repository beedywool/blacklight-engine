// A new effect, `blinds`, defined in a few lines and used for the menu and for the scene change.
import { Graphics, Scene } from '@blacklight/core';
import { defineTransition } from '@blacklight/ui';
import { defineComponent, h } from 'vue';

// `t` goes from 0 (hidden) to 1 (shown), already eased. Twelve bands open like blinds.
defineTransition('blinds', {
  duration: 0.5,
  frame(el, t) {
    const band = 100 / 12;
    const stops: string[] = [];
    for (let i = 0; i < 12; i++) {
      const start = i * band;
      stops.push(
        `#000 ${start}%`,
        `#000 ${start + band * t}%`,
        `transparent ${start + band * t}%`,
        `transparent ${start + band}%`,
      );
    }
    el.style.maskImage = `linear-gradient(180deg, ${stops.join(', ')})`;
  },
  cleanup(el) {
    el.style.maskImage = '';
  },
});

const Menu = defineComponent(
  () => () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:120px 320px;display:grid;place-content:center;background:#fff;color:#080808;font-size:72px',
      },
      'BLINDS',
    ),
);

class Room extends Scene {
  color = 0x181818;
  next = 'other';

  override create() {
    const backdrop = this.spawn(Graphics);
    backdrop.draw.rect(0, 0, this.width, this.height).fill(this.color);
    backdrop.draw.circle(this.width / 2, this.height / 2, 260).fill(0xe60012);
    const menu = this.ui.open(Menu, {}, { enter: 'blinds', leave: 'blinds' });
    this.after(1400, () => menu.close());
    this.after(2400, () => void this.goto(this.next, undefined, { transition: 'blinds' }));
  }
}

class Other extends Room {
  override color = 0x3a3a3a;
  override next = 'main';
}

export const scenes = { other: Other };
export default Room;
