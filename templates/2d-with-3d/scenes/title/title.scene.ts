import { Graphics, Scene, Text } from '@blacklight/core';

/**
 * 2D only: this scene imports nothing from @blacklight/three, so Three.js and the models load when
 * the arena starts, not before. `#bench` in the URL opens the benchmark scene instead
 * (`#bench-2d`: the same scene without models).
 */
export default class Title extends Scene {
  override create() {
    if (location.hash.startsWith('#bench')) {
      void this.goto('bench', { models: location.hash !== '#bench-2d' });
      return;
    }
    const back = this.spawn(Graphics);
    back.draw.rect(0, 0, 1280, 720).fill(0x080808);
    for (let i = 0; i < 6; i++)
      back.draw.rect(0, 420 + i * 50, 1280, 2).fill({ color: 0xffffff, alpha: 0.04 + i * 0.02 });
    this.spawn(Text, {
      x: 640,
      y: 300,
      text: '2D WITH 3D',
      style: { fill: 0xffffff, fontSize: 72, fontWeight: '700' },
    });
    this.spawn(Text, {
      x: 640,
      y: 400,
      text: 'Press Enter, A or tap to start',
      style: { fill: 0x9a9a9a, fontSize: 28 },
    });
  }

  override update() {
    if (this.input.pressed('confirm') || this.pointer.pressed)
      void this.goto('arena', undefined, { transition: 'fade' });
  }
}
