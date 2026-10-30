// Arrows move between cells (empty ones too), Enter or a click uses an item: it leaves the bag.
import { Graphics, Scene } from '@blacklight/core';
import { InventoryGrid } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

interface Item {
  name: string;
  count: number;
}

const Bag = defineComponent(() => {
  const bag = ref<(Item | null)[]>([
    { name: 'BEAD', count: 3 },
    { name: 'SOMA', count: 1 },
    null,
    { name: 'KEY', count: 1 },
    { name: 'ROPE', count: 2 },
    null,
    null,
    { name: 'GEM', count: 9 },
  ]);
  const use = (item: Item | null, index: number) => {
    if (!item) return;
    const next = [...bag.value];
    next[index] = item.count > 1 ? { ...item, count: item.count - 1 } : null;
    bag.value = next;
  };
  return () =>
    h(
      'div',
      { style: 'position:absolute;inset:0;display:grid;place-content:center;font-size:28px' },
      [
        h(
          InventoryGrid,
          {
            items: bag.value,
            columns: 4,
            cellSize: 160,
            onSelect: (item: unknown, index: number) => use(item as Item | null, index),
          },
          {
            default: ({ item }: { item: Item | null }) =>
              item
                ? h('div', { style: 'text-align:center' }, [item.name, h('br'), `×${item.count}`])
                : null,
          },
        ),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Bag);
  }
}
