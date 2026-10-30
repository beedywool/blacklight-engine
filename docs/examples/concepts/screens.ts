// The HUD is opened by the scene; Escape pushes the menu (Enter picks, Escape goes back).
import { Graphics, Scene } from '@blacklight/core';
import { MenuList, useScreen, useUi } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const box =
  'position:absolute;display:flex;flex-direction:column;gap:16px;font-size:40px;color:#fff';

/** Shown over the game, never takes input. */
const Hud = defineComponent({
  props: { message: { type: String, required: true } },
  setup: (props) => () =>
    h('div', { style: `${box};left:40px;top:30px;font-size:32px` }, props.message),
});

/** A modal resolves with a value: the scene (or screen) awaits it. */
const Order = defineComponent(() => {
  const screen = useScreen({ enter: 'zoom' });
  const items = ['ATTACK', 'GUARD', 'HEAL'].map((label) => ({ label, value: label }));
  return () =>
    h(
      'div',
      { style: `${box};inset:0;justify-content:center;align-items:center;background:#000a` },
      [
        h('h2', { style: 'margin:0' }, 'ORDER'),
        h(MenuList, { items, onSelect: (value: unknown) => screen.close(value) }),
      ],
    );
});

/** Pushed: hides the screens below until it closes. */
const Menu = defineComponent(() => {
  const screen = useScreen({ enter: 'slide-right' });
  const ui = useUi();
  const last = ref('none');
  const items = [
    { label: 'RESUME', value: 'resume' },
    { label: 'ORDER', value: 'order', hint: 'opens a modal' },
    { label: 'QUIT', value: 'quit', hint: 'asks first' },
  ];
  async function select(value: unknown) {
    if (value === 'resume') screen.close();
    if (value === 'order') last.value = String((await ui.modal(Order)) ?? 'cancelled');
    if (value === 'quit' && (await ui.confirm({ message: 'Quit to the title?', danger: true })))
      screen.close();
  }
  return () =>
    h('div', { style: `${box};inset:0;padding:80px;background:#e60012` }, [
      h('h1', { style: 'margin:0;font-size:96px;color:#111' }, 'MENU'),
      h(MenuList, { items, onSelect: select }),
      h('p', { style: 'font-size:28px' }, `last order: ${last.value}`),
    ]);
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    const dot = this.spawn(Graphics, { x: 640, y: 400 });
    dot.draw.circle(0, 0, 60).fill(0xffffff);
    this.every(16, () => (dot.x = 640 + Math.sin(this.steps / 40) * 400));
    // Screens are components, or names of .vue files in ui/ in a project.
    this.ui.open(Hud, { message: 'Escape: menu' });
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push(Menu);
  }
}
