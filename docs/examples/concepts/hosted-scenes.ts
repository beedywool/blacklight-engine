// Two copies of the `pong` scene run inside rectangles of this scene, each with its own objects.
import { Graphics, Scene, Text, behaviors } from '@blacklight/core';

class Ball extends Graphics {
  override create() {
    this.draw.circle(0, 0, 24).fill(0xffffff);
  }
}

/** A tiny scene: `width` and `height` are the size of the rectangle it is hosted in. */
class Pong extends Scene<{ color: number; angle: number }> {
  override create({ color, angle }: { color: number; angle: number }) {
    // The camera looks at the middle of the rectangle.
    this.camera.centerOn(this.width / 2, this.height / 2);
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(color);
    const ball = this.spawn(Ball, { x: this.width / 2, y: this.height / 2 });
    ball.addBehavior(behaviors.bounce({ speed: 420, angle }));
  }
}

export default class Host extends Scene {
  override async create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x080808);
    this.spawn(Text, {
      x: this.width / 2,
      y: 60,
      text: 'hostScene(name, rect, params)',
      style: { fill: 0xc2c2c2, fontFamily: 'ui-monospace, monospace', fontSize: 32 },
    });
    await this.hostScene(
      'pong',
      { x: 60, y: 140, width: 560, height: 520 },
      { color: 0x303030, angle: 35 },
    );
    await this.hostScene(
      'pong',
      { x: 660, y: 140, width: 560, height: 520 },
      { color: 0x5c0a0f, angle: 160 },
    );
  }
}

export const scenes = { pong: Pong };
