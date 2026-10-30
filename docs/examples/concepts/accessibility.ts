// Accessibility options apply at once to the canvas and the UI. Enter: color filter, Space: contrast,
// up and down: text size. A subtitle shows every few seconds.
import { Graphics, Scene, type GameConfig } from '@blacklight/core';
import { RichText, accessibility, subtitle, type ColorFilter } from '@blacklight/ui';
import { defineComponent, h } from 'vue';

// Its own id: the options are saved in this game's settings, not shared with other examples.
export const config: Partial<GameConfig> = { id: 'dev.blacklight.example.accessibility' };

const FILTERS: ColorFilter[] = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'grayscale'];

const Panel = defineComponent(
  () => () =>
    h('div', { style: 'position:absolute;left:60px;top:40px;right:60px;color:#fff' }, [
      h(RichText, {
        style: 'font-size:calc(40px * var(--bl-text-scale))',
        text: `filter <color=primary>${accessibility.colorFilter}</color> · contrast ${accessibility.contrast} · text ×${accessibility.textScale.toFixed(1)}`,
      }),
    ]),
);

export default class Example extends Scene {
  override create() {
    Object.assign(accessibility, { colorFilter: 'none', contrast: 'normal', textScale: 1 });
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    [0xe60012, 0x2fbf4a, 0x2d6cdf, 0xffd60a, 0xffffff].forEach((color, i) => {
      this.spawn(Graphics, { x: 200 + i * 220, y: 380 })
        .draw.circle(0, 0, 90)
        .fill(color);
    });
    this.ui.open(Panel);
    this.every(3000, () =>
      subtitle('The train leaves in five minutes.', { speaker: 'Mira', duration: 2000 }),
    );
  }

  override update() {
    if (this.input.pressed('confirm')) {
      accessibility.colorFilter =
        FILTERS[(FILTERS.indexOf(accessibility.colorFilter) + 1) % FILTERS.length]!;
    }
    if (this.input.pressed('jump'))
      accessibility.contrast = accessibility.contrast === 'high' ? 'normal' : 'high';
    if (this.input.pressed('up'))
      accessibility.textScale = Math.min(2, accessibility.textScale + 0.2);
    if (this.input.pressed('down'))
      accessibility.textScale = Math.max(0.8, accessibility.textScale - 0.2);
  }
}
