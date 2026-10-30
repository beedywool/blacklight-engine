// Every second the hero takes a hit: the red trail shows what was lost, then drains. HP refills at 0.
import { Graphics, Scene } from '@blacklight/core';
import { Gauge } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const hp = ref(100);
const sp = ref(60);

const Hud = defineComponent(
  () => () =>
    h(
      'div',
      {
        style:
          'position:absolute;left:160px;right:160px;top:240px;display:grid;gap:40px;font-size:24px',
      },
      [
        h(Gauge, { value: hp.value, max: 100 }, () => `HP ${hp.value}`),
        h(
          Gauge,
          { value: sp.value, max: 60, color: '#4aa8ff', skewed: false },
          () => `SP ${sp.value}`,
        ),
      ],
    ),
);

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    hp.value = 100;
    sp.value = 60;
    this.ui.open(Hud);
    this.every(1000, () => {
      hp.value = hp.value <= 0 ? 100 : Math.max(0, hp.value - 17);
      sp.value = sp.value >= 60 ? 10 : sp.value + 10;
    });
  }
}
