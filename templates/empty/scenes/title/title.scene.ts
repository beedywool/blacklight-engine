import { Graphics, Scene, Text } from '@blacklight/core';

export default class Title extends Scene {
  private bulb = new Graphics();
  private time = 0;

  create() {
    this.bulb.circle(0, 0, 36).fill({ color: 0xffffff });
    this.bulb.position.set(this.width / 2, 360);
    this.add(this.bulb);

    const title = this.add(
      new Text({
        text: this.game.config.name,
        style: {
          fill: 0xededed,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 96,
          fontWeight: '500',
        },
      }),
    );
    title.anchor.set(0.5);
    title.position.set(this.width / 2, 540);

    const hint = this.add(
      new Text({
        text: 'Edit scenes/title/title.scene.ts and save.',
        style: { fill: 0x8e8e8e, fontFamily: 'ui-monospace, monospace', fontSize: 32 },
      }),
    );
    hint.anchor.set(0.5);
    hint.position.set(this.width / 2, 660);
  }

  update() {
    this.time += 1 / 60;
    this.bulb.alpha = 0.75 + 0.25 * Math.sin(this.time * 2);
  }
}
