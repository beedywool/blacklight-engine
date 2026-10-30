// Up and down move the focus, Enter or a click presses. DELETE stays disabled until COUNT reaches 3.
import { Graphics, Scene } from '@blacklight/core';
import { Button } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const Buttons = defineComponent(() => {
  const count = ref(0);
  return () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:0;display:grid;place-content:center;gap:24px;font-size:40px;text-align:center',
      },
      [
        h('p', { style: 'margin:0;color:#fff' }, `COUNT ${count.value}`),
        h(Button, { autofocus: true, onClick: () => count.value++ }, () => 'COUNT'),
        h(Button, { variant: 'secondary', onClick: () => (count.value = 0) }, () => 'RESET'),
        h(
          Button,
          { variant: 'danger', disabled: count.value < 3, onClick: () => (count.value -= 3) },
          () => 'DELETE 3',
        ),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Buttons);
  }
}
