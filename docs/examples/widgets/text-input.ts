// Click the field and type, Enter submits. With a gamepad, confirm on the field opens the virtual keyboard.
import { Graphics, Scene } from '@blacklight/core';
import { TextInput } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const Name = defineComponent(() => {
  const name = ref('');
  const saved = ref('');
  return () =>
    h('div', { style: 'position:absolute;inset:0;display:grid;place-content:center;gap:24px' }, [
      h(TextInput, {
        modelValue: name.value,
        'onUpdate:modelValue': (v: string) => (name.value = v),
        label: 'NAME',
        placeholder: 'Joker',
        maxLength: 12,
        onSubmit: (v: string) => (saved.value = v),
      }),
      h(
        'p',
        { style: 'font-size:28px;color:#c2c2c2' },
        saved.value ? `Saved: ${saved.value}` : 'Press Enter to save.',
      ),
    ]);
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Name);
  }
}
