// Escape opens the pause menu. Add a VOLUME slider to it, under RESUME.
import { Graphics, Scene } from '@blacklight/core';
import { MenuList, useScreen } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

/** Game state the screens show. Vue redraws them when it changes. */
const hp = ref(5);

/** Drawn over the game. A screen opened with `ui.open` never takes input. */
const Hud = defineComponent(
  () => () =>
    h(
      'div',
      { style: 'position:absolute;left:40px;top:30px;width:400px;font-size:32px;color:#fff' },
      `HP ${hp.value} / 5`,
    ),
);

/** The pause menu (exported: in a project, it would be ui/PauseMenu.vue). */
export const Menu = defineComponent(() => {
  const screen = useScreen({ enter: 'slide-right' });
  const items = [{ label: 'RESUME', value: 'resume' }];
  return () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:0;padding:80px;display:flex;flex-direction:column;gap:24px;font-size:48px;color:#fff;background:#e60012',
      },
      [
        h('h1', { style: 'margin:0;font-size:96px;color:#111' }, 'PAUSE'),
        h(MenuList, { items, onSelect: () => screen.close() }),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    const dot = this.spawn(Graphics, { x: 640, y: 400 });
    dot.draw.circle(0, 0, 60).fill(0xffffff);
    this.every(16, () => (dot.x = 640 + Math.sin(this.steps / 40) * 400));
    this.ui.open(Hud);
    this.every(1500, () => (hp.value = hp.value === 0 ? 5 : hp.value - 1));
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push(Menu);
  }
}
