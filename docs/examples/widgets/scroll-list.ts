// 10 000 rows, only the visible ones rendered. Up and down scroll row by row, the wheel scrolls too.
import { Graphics, Scene } from '@blacklight/core';
import { ScrollList } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

interface Entry {
  name: string;
  level: number;
}
const entries: Entry[] = Array.from({ length: 10_000 }, (_, i) => ({
  name: `Record ${String(i + 1).padStart(5, '0')}`,
  level: 1 + ((i * 37) % 99),
}));

const Records = defineComponent(() => {
  const picked = ref('none');
  return () =>
    h('div', { style: 'position:absolute;left:240px;top:80px;width:800px;font-size:30px' }, [
      h(
        ScrollList,
        {
          items: entries,
          itemHeight: 64,
          height: 512,
          onSelect: (item: unknown) => (picked.value = (item as Entry).name),
        },
        {
          default: ({ item }: { item: Entry }) =>
            h(
              'div',
              {
                style: 'display:flex;justify-content:space-between;padding:0 24px;line-height:64px',
              },
              [h('span', item.name), h('span', `LV ${item.level}`)],
            ),
        },
      ),
      h('p', { style: 'color:#c2c2c2' }, `Picked: ${picked.value}`),
    ]);
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Records);
  }
}
