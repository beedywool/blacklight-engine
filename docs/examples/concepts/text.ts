// Text objects: Pixi text styles, anchors, and a text updated every step.
import { Graphics, Scene, Text } from '@blacklight/core';

export default class Example extends Scene {
  private clock!: Text;

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    this.spawn(Text, {
      x: this.width / 2,
      y: 220,
      text: 'BLACKLIGHT',
      style: {
        fill: 0xffffff,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 140,
        fontWeight: '800',
        letterSpacing: 12,
        stroke: { color: 0xe60012, width: 10 },
        dropShadow: { color: 0x000000, distance: 10, angle: Math.PI / 4, blur: 0, alpha: 1 },
      },
    });
    const left = this.spawn(Text, {
      x: 120,
      y: 420,
      text: 'Anchored on its left edge,\nwrapped and spaced.',
      style: { fill: 0xc2c2c2, fontFamily: 'Georgia, serif', fontSize: 40, lineHeight: 56 },
    });
    // Text is centered by default.
    left.anchor.set(0, 0);
    this.clock = this.spawn(Text, {
      x: this.width - 120,
      y: 640,
      text: '',
      style: { fill: 0xededed, fontFamily: 'ui-monospace, monospace', fontSize: 48 },
    });
    this.clock.anchor.set(1, 0.5);
  }

  override update() {
    this.clock.text = (this.steps / 60).toFixed(2);
  }
}
