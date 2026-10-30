// Hover an item with the mouse, or move the focus onto it with the arrows: its tooltip appears.
import { Graphics, Scene } from '@blacklight/core';
import { Button, Tooltip } from '@blacklight/ui';
import { defineComponent, h } from 'vue';

const items = [
  { name: 'BEAD', text: 'Restores 50 HP', side: 'top' },
  { name: 'SOMA', text: 'Restores all SP', side: 'bottom' },
  { name: 'ROPE', text: 'Leaves the dungeon', side: 'right' },
] as const;

const Shop = defineComponent(
  () => () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:64px;font-size:36px',
      },
      items.map((item, i) =>
        h(Tooltip, { text: item.text, side: item.side }, () =>
          h(Button, { autofocus: i === 0 }, () => item.name),
        ),
      ),
    ),
);

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Shop);
  }
}
