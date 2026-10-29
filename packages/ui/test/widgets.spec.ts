import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref, type Component } from 'vue';
import Counter from '../src/widgets/Counter.vue';
import InventoryGrid from '../src/widgets/InventoryGrid.vue';
import MenuList from '../src/widgets/MenuList.vue';
import RadialMenu from '../src/widgets/RadialMenu.vue';
import ScrollList from '../src/widgets/ScrollList.vue';
import Select from '../src/widgets/Select.vue';
import Slider from '../src/widgets/Slider.vue';
import Tabs from '../src/widgets/Tabs.vue';
import TextInput from '../src/widgets/TextInput.vue';
import Toggle from '../src/widgets/Toggle.vue';
import Tooltip from '../src/widgets/Tooltip.vue';
import Gauge from '../src/widgets/Gauge.vue';
import { toast, toasts } from '../src/widgets/toast';
import { Timeline } from '../src/timeline';
import { installUi, place, settle } from './helpers';

/** Opens `render` as a screen and returns the UI and its element. */
async function screen(render: () => ReturnType<typeof h>) {
  const { runtime, game } = installUi();
  runtime.global.push(
    defineComponent({ setup: () => render }) as Component,
    {},
    { enter: 'none', leave: 'none' },
  );
  await settle();
  const root = runtime.element.querySelector('.bl-screen') as HTMLElement;
  return { runtime, game, root };
}

const navigate = (element: Element, direction: string) =>
  element.dispatchEvent(
    new CustomEvent('bl-navigate', { detail: { direction }, cancelable: true, bubbles: true }),
  );

describe('widgets', () => {
  it('Slider, Toggle and Select take left/right instead of moving focus', async () => {
    const volume = ref(0.5);
    const on = ref(false);
    const choice = ref('a');
    const { root } = await screen(() =>
      h('div', [
        h(Slider, {
          modelValue: volume.value,
          'onUpdate:modelValue': (v: number) => (volume.value = v),
          label: 'Music',
        }),
        h(Toggle, { modelValue: on.value, 'onUpdate:modelValue': (v: boolean) => (on.value = v) }),
        h(Select, {
          modelValue: choice.value,
          'onUpdate:modelValue': (v: unknown) => (choice.value = v as string),
          options: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
          ],
        }),
      ]),
    );
    expect(navigate(root.querySelector('.bl-slider')!, 'right')).toBe(false);
    expect(volume.value).toBeCloseTo(0.6);
    navigate(root.querySelector('.bl-toggle')!, 'right');
    expect(on.value).toBe(true);
    (root.querySelector('.bl-toggle') as HTMLElement).click();
    navigate(root.querySelector('.bl-select')!, 'left');
    expect(choice.value).toBe('b');
    expect(navigate(root.querySelector('.bl-slider')!, 'down')).toBe(true);
  });

  it('MenuList reports selection and the focused row; disabled rows are skipped', async () => {
    const select = vi.fn();
    const { root, runtime } = await screen(() =>
      h(MenuList, {
        items: [
          { label: 'One', value: 1 },
          { label: 'Two', value: 2, disabled: true },
          { label: 'Three', value: 3 },
        ],
        onSelect: select,
      }),
    );
    const rows = root.querySelectorAll<HTMLElement>('.bl-menu__item');
    rows.forEach((row, i) => place(row, 0, i * 60));
    runtime.focus.focus(rows[0]!);
    await settle();
    expect(rows[0]!.classList.contains('bl-menu__item--focused')).toBe(true);
    runtime.focus.move('down');
    expect(runtime.focus.current.value).toBe(rows[2]);
    rows[2]!.click();
    expect(select).toHaveBeenCalledWith(3, 2);
  });

  it('Tabs switch with tabLeft / tabRight', async () => {
    const tab = ref(0);
    const { game } = await screen(() =>
      h(Tabs, {
        tabs: ['A', 'B', 'C'],
        modelValue: tab.value,
        'onUpdate:modelValue': (v: number) => (tab.value = v),
      }),
    );
    game.input.keyDown('KeyE');
    game.stepOnce();
    expect(tab.value).toBe(1);
    game.input.keyUp('KeyE');
    game.stepOnce();
    expect(tab.value).toBe(1);
    await settle();
    game.input.keyDown('KeyQ');
    game.stepOnce();
    expect(tab.value).toBe(0);
  });

  it('ScrollList renders only the visible rows', async () => {
    const items = Array.from({ length: 500 }, (_, i) => `Row ${i}`);
    const { root } = await screen(() =>
      h(
        ScrollList,
        { items, itemHeight: 50, height: 300 },
        { default: ({ item }: { item: string }) => item },
      ),
    );
    const rows = root.querySelectorAll('.bl-scroll__row');
    expect(rows.length).toBeLessThan(20);
    expect(rows[0]?.textContent).toBe('Row 0');
  });

  it('InventoryGrid, Gauge, Counter, Tooltip and toasts render', async () => {
    const pick = vi.fn();
    const { root, runtime } = await screen(() =>
      h('div', [
        h(
          InventoryGrid,
          { items: ['Potion', null], columns: 2, onSelect: pick },
          { default: ({ item }: { item: string | null }) => item ?? '' },
        ),
        h(Gauge, { value: 40, max: 80 }, () => 'HP'),
        h(Counter, { value: 1234 }),
        h(Tooltip, { text: 'Heals' }, () =>
          h('button', { 'data-bl-focus': '', class: 'tip-target' }, 'Hover'),
        ),
      ]),
    );
    (root.querySelector('.bl-grid__cell') as HTMLElement).click();
    expect(pick).toHaveBeenCalledWith('Potion', 0);
    expect(root.querySelector('.bl-gauge')?.getAttribute('aria-valuemax')).toBe('80');
    expect(root.querySelector('.bl-counter')?.textContent).toBe('1,234');
    runtime.focus.focus(root.querySelector('.tip-target'));
    await settle();
    expect(root.querySelector('.bl-tooltip')?.textContent).toBe('Heals');
    toast('Saved');
    await settle();
    expect(runtime.element.querySelector('.bl-toast')?.textContent).toBe('Saved');
    toasts.splice(0);
  });

  it('TextInput ignores IME composition until it ends; gamepads get the virtual keyboard', async () => {
    const value = ref('');
    const { root, runtime, game } = await screen(() =>
      h(TextInput, {
        modelValue: value.value,
        'onUpdate:modelValue': (v: string) => (value.value = v),
      }),
    );
    const input = root.querySelector('input')!;
    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = 'に';
    input.dispatchEvent(new Event('input'));
    expect(value.value).toBe('');
    input.dispatchEvent(new CompositionEvent('compositionend'));
    expect(value.value).toBe('に');
    await settle();

    game.input.lastDevice = 'gamepad';
    input.click();
    await settle();
    const keyboard = runtime.element.querySelector('.bl-keyboard');
    expect(keyboard).not.toBeNull();
    const keys = keyboard!.querySelectorAll<HTMLElement>('.bl-keyboard__key');
    keys[10]!.click(); // q
    [...keys].find((k) => k.textContent?.trim() === 'Done')!.click();
    await settle();
    expect(value.value).toBe('にq');
  });

  it('RadialMenu picks the item the stick points to', async () => {
    const pick = vi.fn();
    const { root, game } = await screen(() =>
      h(RadialMenu, {
        items: ['N', 'E', 'S', 'W'].map((label) => ({ label, value: label })),
        onSelect: pick,
      }),
    );
    game.input.keyDown('ArrowRight');
    game.stepOnce();
    await settle();
    (root.querySelector('.bl-radial') as HTMLElement).click();
    expect(pick).toHaveBeenCalledWith('E', 1);
  });
});

describe('Timeline on the game clock', () => {
  it('runs cues in order and stops cleanly when interrupted', async () => {
    const { game } = installUi();
    const element = document.createElement('div');
    const log: string[] = [];
    const first = new Timeline(game, 'game')
      .to(element, { opacity: [0, 1] }, { duration: 0.5 })
      .call(() => log.push('half'), 0.25)
      .sound('whoosh', 0.4);
    const done = first.play();
    for (let i = 0; i < 30; i++) game.stepOnce();
    expect(log).toEqual(['half']);
    expect((game as unknown as { played: string[] }).played).toEqual(['whoosh']);
    // A second timeline on the same element interrupts the first.
    const second = new Timeline(game, 'game').to(element, { opacity: [1, 0] }, { duration: 0.2 });
    void second.play();
    await expect(done).resolves.toBeUndefined();
    expect(first.playing).toBe(false);
    expect(second.playing).toBe(true);
  });
});
