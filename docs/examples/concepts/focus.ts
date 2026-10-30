// Arrows move the focus through two groups (the grid wraps, the bar does not); Enter or a click picks.
import { Graphics, Scene } from '@blacklight/core';
import { FocusGroup, vFocus } from '@blacklight/ui';
import { defineComponent, h, ref, withDirectives } from 'vue';

const css = `
.cards { display: grid; grid-template-columns: repeat(4, 180px); gap: 24px; }
.card, .action { background: #303030; color: #fff; font-size: 32px; padding: 28px; text-align: center; }
.card.is-picked { outline: 6px solid #e60012; }
.card[data-bl-focused], .action[data-bl-focused] { background: #fff; color: #111; transform: scale(1.06); }
.bar { display: flex; gap: 24px; }
`;

const Board = defineComponent(() => {
  const picked = ref(new Set<number>());
  const toggle = (n: number) => {
    const next = new Set(picked.value);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    picked.value = next;
  };
  // `v-focus` in templates; in render functions, withDirectives(vnode, [[vFocus]]).
  const card = (n: number) =>
    withDirectives(
      h(
        'div',
        { class: ['card', { 'is-picked': picked.value.has(n) }], onClick: () => toggle(n) },
        `${n}`,
      ),
      [[vFocus]],
    );
  return () =>
    h('div', { style: 'position:absolute;inset:0;display:grid;place-content:center;gap:48px' }, [
      h('style', css),
      h(FocusGroup, { class: 'cards', wrap: true }, () =>
        Array.from({ length: 8 }, (_, i) => card(i + 1)),
      ),
      h(FocusGroup, { class: 'bar', axis: 'x' }, () => [
        withDirectives(
          h('div', { class: 'action', onClick: () => (picked.value = new Set()) }, 'CLEAR'),
          [[vFocus]],
        ),
        withDirectives(h('div', { class: 'action' }, `${picked.value.size} PICKED`), [[vFocus]]),
      ]),
    ]);
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    // `push` gives the screen the focus (and blocks game input while it is open).
    this.ui.push(Board, {}, { closeOnBack: false });
  }
}
