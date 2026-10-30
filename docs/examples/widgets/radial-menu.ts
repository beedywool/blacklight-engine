// Point with the arrows, the stick or the mouse; Enter or a click gives the order.
import { Graphics, Scene } from '@blacklight/core';
import { RadialMenu } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const orders = ['ATTACK', 'GUARD', 'HEAL', 'FREE', 'WAIT', 'RUN'].map((label) => ({
  label,
  value: label,
}));

const Orders = defineComponent(() => {
  const order = ref('—');
  return () =>
    h(
      'div',
      { style: 'position:absolute;inset:0;display:grid;place-items:center;font-size:30px' },
      [
        h(RadialMenu, {
          items: orders,
          radius: 200,
          onSelect: (value: unknown) => (order.value = String(value)),
        }),
        h(
          'p',
          { style: 'position:absolute;left:40px;bottom:24px;margin:0;color:#c2c2c2' },
          `Order: ${order.value}`,
        ),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Orders);
  }
}
