// Left and right switch the language at runtime (Arabic flips the layout); up and down change the
// plural count. In a project the files sit in locales/ and load by themselves.
import { Graphics, Scene } from '@blacklight/core';
import { onUiStep, t, uiOf, useGame } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';
import ar from './ar.json';
import en from './en.json';
import ja from './ja.json';

const LANGUAGES = ['en', 'ja', 'ar'];

const Card = defineComponent(() => {
  const game = useGame();
  const i18n = uiOf(game).i18n;
  const coins = ref(1);
  onUiStep(() => {
    const input = game.input.uiPlayer(1);
    const step = (input.pressed('right') ? 1 : 0) - (input.pressed('left') ? 1 : 0);
    if (step) {
      const next =
        (LANGUAGES.indexOf(i18n.locale.value) + step + LANGUAGES.length) % LANGUAGES.length;
      void i18n.setLocale(LANGUAGES[next]!, { save: false });
    }
    if (input.pressed('up')) coins.value += coins.value < 10 ? 1 : 100;
    if (input.pressed('down')) coins.value = Math.max(0, coins.value - 1);
  });
  // Every t() re-renders when the language changes.
  return () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:80px;display:flex;flex-direction:column;gap:28px;color:#fff',
      },
      [
        h('h1', { style: 'margin:0;font-size:80px' }, t('title')),
        h('p', { style: 'margin:0;font-size:52px' }, t('greeting', { name: 'Aoi' })),
        h(
          'p',
          { style: 'margin:0;font-size:52px;color:#e60012' },
          t('coins', { count: coins.value }),
        ),
        h(
          'p',
          { style: 'margin:0;font-size:28px;color:#8e8e8e' },
          `${i18n.locale.value} · ${t('hint')}`,
        ),
      ],
    );
});

export default class Example extends Scene {
  override async create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    const i18n = uiOf(this.game).i18n;
    i18n.add('en', en);
    i18n.add('ja', ja);
    i18n.add('ar', ar);
    await i18n.setLocale('en', { save: false });
    this.ui.open(Card);
  }
}
