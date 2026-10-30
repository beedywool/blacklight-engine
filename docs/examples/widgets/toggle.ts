// Right turns a toggle on, left off, Enter or a click flips it. SUBTITLES shows the line below.
import { Graphics, Scene } from '@blacklight/core';
import { Toggle } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const Options = defineComponent(() => {
  const subtitles = ref(true);
  const vibration = ref(false);
  return () =>
    h('div', { style: 'position:absolute;inset:0;display:grid;place-content:center;gap:24px' }, [
      h(Toggle, {
        modelValue: subtitles.value,
        'onUpdate:modelValue': (v: boolean) => (subtitles.value = v),
        label: 'SUBTITLES',
      }),
      h(Toggle, {
        modelValue: vibration.value,
        'onUpdate:modelValue': (v: boolean) => (vibration.value = v),
        label: 'VIBRATION',
        on: 'YES',
        off: 'NO',
      }),
      subtitles.value
        ? h(
            'p',
            { style: 'font-size:28px;color:#fff;background:#000a;padding:8px 16px' },
            '— We have to leave before dawn.',
          )
        : null,
    ]);
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Options);
  }
}
