// Every 1.5 s the money grows and counts up to its new value instead of jumping.
import { Graphics, Scene } from '@blacklight/core';
import { Counter } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const money = ref(48200);
const ratio = ref(0.5);

const Hud = defineComponent(
  () => () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:0;display:grid;place-content:center;gap:24px;font-size:96px;color:#fff',
      },
      [
        h('div', ['¥ ', h(Counter, { value: money.value })]),
        h('div', { style: 'font-size:48px;color:#c2c2c2' }, [
          h(Counter, { value: ratio.value * 100, digits: 1, duration: 900 }),
          ' % complete',
        ]),
      ],
    ),
);

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Hud);
    this.every(1500, () => {
      money.value += 1250 + this.game.random.int(0, 5000);
      ratio.value = (ratio.value + 0.137) % 1;
    });
  }
}
