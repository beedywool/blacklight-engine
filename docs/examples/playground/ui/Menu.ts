// The pause menu: pushed by the scene, it pauses the game below and takes the focus.
import { MenuList, Skew, useGame, useScreen } from '@blacklight/ui';
import { defineComponent, h } from 'vue';

export default defineComponent(() => {
  const game = useGame();
  const screen = useScreen({ enter: 'slash', leave: 'fade' });
  const items = [
    { label: 'RESUME', value: 'resume' },
    { label: 'RESTART', value: 'restart' },
  ];
  function select(value: string) {
    screen.close();
    if (value === 'restart') void game.goto('main', undefined, { transition: 'iris' });
  }
  return () =>
    h('div', { style: 'position:absolute;inset:0;background:rgba(8,8,8,0.6)' }, [
      h(
        Skew,
        {
          color: '#e60012',
          style:
            'position:absolute;left:48px;top:40px;padding:4px 24px;font:400 56px var(--bl-font-display)',
        },
        () => 'PAUSE',
      ),
      h(MenuList, {
        items,
        onSelect: (value: unknown) => select(String(value)),
        style: 'position:absolute;left:64px;top:140px;font-size:36px',
      }),
    ]);
});
