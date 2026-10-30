// The FX layer: Enter cycles the lasting effect on the game, Space fires a glitch pulse. The title
// over the UI goes through a shader too (PixiRender).
import { Graphics, Scene, Text } from '@blacklight/core';
import { PixiRender, uiOf, type FxHandle, type FxName } from '@blacklight/ui';
import { defineComponent, h } from 'vue';

const EFFECTS: (FxName | 'none')[] = ['none', 'halftone', 'blur', 'chromatic', 'distort'];

const Logo = defineComponent(
  () => () =>
    h('div', { style: 'position:absolute;right:80px;bottom:60px' }, [
      // A DOM element rendered into Pixi, so a shader can draw it (shaders cannot read DOM pixels).
      h(PixiRender, { fx: ['glitch'], strength: 0.4 }, () =>
        h('h1', { style: 'margin:0;font:800 96px system-ui,sans-serif;color:#fff' }, 'NEON'),
      ),
    ]),
);

export default class Example extends Scene {
  private index = 0;
  private lasting: FxHandle | undefined;
  private label!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (let i = 0; i < 8; i++) {
      const bar = this.spawn(Graphics, { x: 120 + i * 140, y: 380 });
      bar.draw.rect(-50, -200, 100, 400).fill(i % 2 ? 0xe60012 : 0xffffff);
      this.every(16, () => (bar.y = 380 + Math.sin((this.steps + i * 10) / 20) * 60));
    }
    this.label = this.spawn(Text, {
      layer: 'hud',
      x: this.width / 2,
      y: 50,
      text: 'effect: none',
      style: { fill: 0xededed, fontFamily: 'system-ui, sans-serif', fontSize: 32 },
    });
    this.ui.open(Logo);
  }

  override update() {
    const fx = uiOf(this.game).fx;
    if (this.input.pressed('jump')) void fx.pulse('glitch', { duration: 600 });
    if (this.input.pressed('confirm')) {
      this.index = (this.index + 1) % EFFECTS.length;
      const name = EFFECTS[this.index]!;
      void this.lasting?.remove(200);
      this.lasting = name === 'none' ? undefined : fx.add(name, { strength: 0.7, fade: 300 });
      this.label.text = `effect: ${name}`;
    }
  }
}
