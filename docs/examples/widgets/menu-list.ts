// Up and down move through the rows (CONTINUE is disabled and skipped), Enter or a click selects.
import { Graphics, Scene } from '@blacklight/core';
import { MenuList } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const items = [
  { label: 'NEW GAME', value: 'new' },
  { label: 'CONTINUE', value: 'continue', disabled: true },
  { label: 'CONFIG', value: 'config', hint: 'Audio, display, controls' },
  { label: 'QUIT', value: 'quit' },
];

const Title = defineComponent(() => {
  const chosen = ref('nothing yet');
  return () =>
    h('div', { style: 'position:absolute;left:120px;top:120px;font-size:56px' }, [
      h(MenuList, {
        items,
        // Generic components rendered with h() type their values as unknown.
        onSelect: (value: unknown) => (chosen.value = String(value)),
      }),
      h('p', { style: 'font-size:28px;color:#c2c2c2' }, `Selected: ${chosen.value}`),
    ]);
});

export default class Example extends Scene {
  override create() {
    const backdrop = this.spawn(Graphics);
    backdrop.draw.rect(0, 0, this.width, this.height).fill(0x111111);
    backdrop.draw.poly([700, 0, 1280, 0, 1280, 720, 520, 720]).fill(0xe60012);
    this.ui.open(Title);
  }
}
