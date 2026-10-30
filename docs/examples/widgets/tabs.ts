// Q and E (or LB and RB) switch tabs wherever the focus is; clicking a tab works too.
import { Graphics, Scene } from '@blacklight/core';
import { Slider, Tabs, Toggle } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const Settings = defineComponent(() => {
  const tab = ref(0);
  const volume = ref(0.7);
  const fullscreen = ref(false);
  const pages = [
    () =>
      h(Slider, {
        modelValue: volume.value,
        'onUpdate:modelValue': (v: number) => (volume.value = v),
        label: 'VOLUME',
      }),
    () =>
      h(Toggle, {
        modelValue: fullscreen.value,
        'onUpdate:modelValue': (v: boolean) => (fullscreen.value = v),
        label: 'FULLSCREEN',
      }),
    () => h('p', { style: 'font-size:30px' }, 'Move: arrows / WASD. Confirm: Enter.'),
  ];
  return () =>
    h(
      'div',
      {
        style:
          'position:absolute;left:160px;right:160px;top:120px;display:grid;gap:48px;font-size:40px',
      },
      [
        h(Tabs, {
          tabs: ['AUDIO', 'DISPLAY', 'CONTROLS'],
          modelValue: tab.value,
          'onUpdate:modelValue': (v: number) => (tab.value = v),
          prompts: true,
        }),
        pages[tab.value]!(),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Settings);
  }
}
