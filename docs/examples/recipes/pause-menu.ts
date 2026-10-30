// Move with the arrows, Escape opens the menu. The ship stops under the menu: game input is blocked.
import { Graphics, Scene, behaviors } from '@blacklight/core';
import { MenuList, Slider, useGame, useScreen } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const PauseMenu = defineComponent(() => {
  const game = useGame();
  const screen = useScreen({ enter: 'slash', leave: 'fade' });
  const volume = ref(game.audio.volume('music'));
  const items = [
    { label: 'RESUME', value: 'resume' },
    { label: 'RESTART', value: 'restart' },
  ];
  function select(value: unknown) {
    screen.close();
    if (value === 'restart') void game.goto('main', undefined, { transition: 'iris' });
  }
  return () =>
    h(
      'div',
      { style: 'position:absolute;inset:0 45% 0 0;padding:96px;background:#e60012;color:#111' },
      [
        h('h2', { style: 'margin:0 0 32px;font:400 96px/1 var(--bl-font-display)' }, 'PAUSE'),
        h(MenuList, { items, onSelect: select, style: 'font-size:48px' }),
        h(Slider, {
          style: 'margin-top:32px',
          label: 'MUSIC',
          modelValue: volume.value,
          'onUpdate:modelValue': (value: number) => {
            volume.value = value;
            game.audio.volume('music', value);
          },
        }),
      ],
    );
});

class Ship extends Graphics {
  static override behaviors = [behaviors.eightDirections({ speed: 400 })];
  override create() {
    this.draw.poly([0, -30, 24, 24, -24, 24]).fill(0xffffff);
  }
}

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.spawn(Ship, { x: this.width / 2, y: this.height / 2 });
  }

  override update() {
    if (this.input.pressed('pause')) this.ui.push(PauseMenu);
  }
}
