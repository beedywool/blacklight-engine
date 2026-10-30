// Persona-style shapes: Skew, Slant and Mask, brought in by a timeline. Enter replays the timeline.
import { Graphics, Scene } from '@blacklight/core';
import { Mask, Skew, Slant, onUiStep, useGame, useTimeline } from '@blacklight/ui';
import { defineComponent, h, onMounted, onBeforeUnmount, ref } from 'vue';

const Card = defineComponent(() => {
  const game = useGame();
  const banner = ref<HTMLElement | null>(null);
  const shown = ref(1);

  // A timeline: steps placed with labels and offsets, played and replayed cleanly.
  const intro = useTimeline()
    .to(banner, { x: ['-120%', '0%'] }, { duration: 0.3, ease: [0.05, 0.7, 0.1, 1] })
    .label('rows')
    .to('.demo-row', { x: [-160, 0], opacity: [0, 1] }, { at: 'rows', duration: 0.2 });
  onMounted(() => void intro.play());
  onUiStep(() => {
    if (game.input.uiPlayer(1).pressed('confirm')) void intro.play();
  });

  // The mask hides and shows its content every 1.5 s, with a 400 ms transition.
  const timer = setInterval(() => (shown.value = shown.value ? 0 : 1), 1500);
  onBeforeUnmount(() => clearInterval(timer));

  return () =>
    h(
      'div',
      {
        style:
          'position:absolute;inset:0;padding:60px 80px;display:flex;flex-direction:column;gap:28px',
      },
      [
        h('div', { ref: banner, style: 'font-size:72px' }, [
          h(Slant, { left: 0, right: 48, color: '#e60012', shadow: '#000' }, () =>
            h('span', { style: 'padding:0 60px 0 24px' }, 'SKILLS'),
          ),
        ]),
        ...['AGI', 'BUFU', 'ZIO'].map((name, i) =>
          h('div', { class: 'demo-row', style: 'font-size:48px' }, [
            h(
              Skew,
              {
                color: i === 0 ? '#fff' : '#111',
                shadow: '#e60012',
                outline: i === 0 ? 0 : 2,
                active: i === 0,
              },
              () => h('span', { style: `padding:0 32px;color:${i === 0 ? '#111' : '#fff'}` }, name),
            ),
          ]),
        ),
        h(
          Mask,
          {
            shape: 'slash',
            progress: shown.value,
            duration: 400,
            style: 'position:absolute;right:120px;top:140px',
          },
          () =>
            h('div', {
              style:
                'width:360px;height:420px;background:repeating-linear-gradient(-60deg,#fff 0 30px,#e60012 30px 60px)',
            }),
        ),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Card);
  }
}
