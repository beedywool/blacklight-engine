// Left and right cycle through the options; THEME switches the UI theme live.
import { Graphics, Scene } from '@blacklight/core';
import { Select, uiOf } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    const runtime = uiOf(this.game);
    const Options = defineComponent(() => {
      const theme = ref('blacklight');
      const difficulty = ref(1);
      return () =>
        h(
          'div',
          { style: 'position:absolute;inset:0;display:grid;place-content:center;gap:24px' },
          [
            h(Select, {
              modelValue: theme.value,
              'onUpdate:modelValue': (value: unknown) => {
                theme.value = String(value);
                runtime.theme = theme.value;
              },
              label: 'THEME',
              options: [
                { label: 'BLACKLIGHT', value: 'blacklight' },
                { label: 'PERSONA', value: 'persona' },
              ],
            }),
            h(Select, {
              modelValue: difficulty.value,
              'onUpdate:modelValue': (value: unknown) => (difficulty.value = Number(value)),
              label: 'DIFFICULTY',
              wrap: false,
              options: [
                { label: 'EASY', value: 0 },
                { label: 'NORMAL', value: 1 },
                { label: 'HARD', value: 2 },
              ],
            }),
          ],
        );
    });
    this.ui.open(Options);
  }
}
