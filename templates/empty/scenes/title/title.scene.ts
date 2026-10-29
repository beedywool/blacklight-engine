import { Graphics, Scene, Text } from '@blacklight/core';

export default class Title extends Scene {
  private bulb!: Graphics;

  create() {
    this.bulb = this.spawn(Graphics, { x: this.width / 2, y: 360 });
    this.bulb.draw.circle(0, 0, 36).fill({ color: 0xffffff });

    this.spawn(Text, {
      x: this.width / 2,
      y: 540,
      text: this.game.config.name,
      style: {
        fill: 0xededed,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 96,
        fontWeight: '500',
      },
    });
    this.spawn(Text, {
      x: this.width / 2,
      y: 660,
      text: 'Edit scenes/title/title.scene.ts and save.',
      style: { fill: 0x8e8e8e, fontFamily: 'ui-monospace, monospace', fontSize: 32 },
    });
  }

  update() {
    this.bulb.alpha = 0.75 + 0.25 * Math.sin((this.steps / 60) * 2);
  }
}
