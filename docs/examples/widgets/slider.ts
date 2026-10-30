// Left and right change the focused slider; the mouse drags it. The bar below follows MUSIC.
import { Graphics, Scene } from '@blacklight/core';
import { Slider } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const Settings = defineComponent(() => {
  const music = ref(0.8);
  const scale = ref(1);
  return () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:0;display:grid;place-content:center;gap:32px;font-size:56px',
      },
      [
        h(Slider, {
          modelValue: music.value,
          'onUpdate:modelValue': (value: number) => (music.value = value),
          label: 'MUSIC',
        }),
        h(
          Slider,
          {
            modelValue: scale.value,
            'onUpdate:modelValue': (value: number) => (scale.value = value),
            label: 'UI SCALE',
            min: 0.75,
            max: 1.5,
            step: 0.05,
          },
          { default: ({ value }: { value: number }) => `${Math.round(value * 100)}%` },
        ),
        h('div', { style: `height:12px;width:${music.value * 900}px;background:#fff` }),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Settings);
  }
}
