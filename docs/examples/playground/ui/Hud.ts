// Screens are Vue components. The playground has no .vue compiler, so they are written with
// render functions here; in a game, ui/Hud.vue does the same with a template.
import { Counter, InputPrompt } from '@blacklight/ui';
import { defineComponent, h, type PropType } from 'vue';

export default defineComponent({
  props: {
    score: { type: Object as PropType<{ coins: number; total: number }>, required: true },
  },
  setup(props) {
    return () =>
      h(
        'div',
        {
          style:
            'position:absolute;inset:16px 20px;display:flex;align-items:flex-start;justify-content:space-between;font:600 22px var(--bl-font-display)',
        },
        [
          h('div', [
            'COINS ',
            h(Counter, { value: props.score.coins, duration: 300 }),
            ` / ${props.score.total}`,
          ]),
          h(InputPrompt, { action: 'pause', label: 'MENU', size: 22 }),
        ],
      );
  },
});
