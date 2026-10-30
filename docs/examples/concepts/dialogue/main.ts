// An Ink dialogue: Enter advances (or completes the line), arrows pick a choice. Edit the speakers below.
// story.json is story.ink compiled; in a project the CLI compiles stories/*.ink for you.
import { Graphics, Scene, Text } from '@blacklight/core';
import { Dialogue, DialogueBox } from '@blacklight/ui';
import { defineComponent, h, type PropType } from 'vue';
import story from './story.json';

const StoryScreen = defineComponent({
  props: { dialogue: { type: Object as PropType<Dialogue>, required: true } },
  setup: (props) => () =>
    h(DialogueBox, {
      dialogue: props.dialogue,
      speakers: { mira: { name: 'Mira', color: '#e60012' } },
    }),
});

export default class Example extends Scene {
  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x202024);
    const place = this.spawn(Text, {
      x: this.width / 2,
      y: 120,
      text: 'STATION',
      style: {
        fill: 0x8e8e8e,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 64,
        letterSpacing: 16,
      },
    });

    const dialogue = new Dialogue(story, { game: this.game });
    // Tags the box does not handle reach the scene: `# bg: platform` in the story.
    dialogue.events.on('tag', ({ tag }) => {
      if (tag.name === 'bg') place.text = String(tag.value).toUpperCase();
    });
    dialogue.start();
    this.ui.open(StoryScreen, { dialogue });
  }
}
