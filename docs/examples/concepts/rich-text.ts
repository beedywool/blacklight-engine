// Rich text: tags for color, size, wave, shake, pauses and input prompts, typed out. Enter restarts.
import { Graphics, Scene } from '@blacklight/core';
import { RichText, onUiStep, useGame } from '@blacklight/ui';
import { defineComponent, h, ref } from 'vue';

const LINES =
  'Press <input=confirm> to <wave>start</wave>.\n' +
  '<color=danger>Careful</color>, the floor is <shake>unstable</shake><pause=500>...\n' +
  '<size=1.6><b>BIG</b></size> <i>and</i> <speed=0.3>slow</speed> text.';

const Story = defineComponent(() => {
  const game = useGame();
  const run = ref(0);
  const done = ref(false);
  onUiStep(() => {
    if (game.input.uiPlayer(1).pressed('confirm')) {
      run.value++;
      done.value = false;
    }
  });
  return () =>
    h(
      'div',
      {
        style:
          'position:absolute;left:80px;right:80px;top:120px;font-size:52px;line-height:1.5;color:#fff;white-space:pre-line',
      },
      [
        // A new key restarts the component, so the typewriter starts over.
        h(RichText, {
          key: run.value,
          text: LINES,
          typewriter: 30,
          appear: 'rise',
          onDone: () => (done.value = true),
        }),
        h('p', { style: 'font-size:28px;color:#8e8e8e' }, done.value ? 'done' : 'typing…'),
      ],
    );
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.ui.open(Story);
  }
}
