// Three movers on the same path: 'loop' goes round, 'pingpong' goes back and forth, 'once' stops
// at the end and calls onComplete (it turns red).
import { Graphics, Scene, behaviors, type Point } from '@blacklight/core';

const PATH: Point[] = [
  { x: 200, y: 160 },
  { x: 1080, y: 160 },
  { x: 1080, y: 560 },
  { x: 640, y: 360 },
  { x: 200, y: 560 },
];

class Arrow extends Graphics {
  override create() {
    this.draw.poly([24, 0, -16, -16, -8, 0, -16, 16]).fill(0xffffff);
  }
}

export default class Example extends Scene {
  override create() {
    const line = this.spawn(Graphics);
    line.draw
      .poly(
        PATH.flatMap((p) => [p.x, p.y]),
        true,
      )
      .stroke({ color: 0x3a3a3a, width: 4 });
    for (const p of PATH) line.draw.circle(p.x, p.y, 8).fill(0x8e8e8e);

    const modes = ['loop', 'pingpong', 'once'] as const;
    modes.forEach((mode, i) => {
      const arrow = this.spawn(Arrow, { x: PATH[0]!.x, y: PATH[0]!.y });
      arrow.addBehavior(
        behaviors.pathFollow({
          points: PATH,
          speed: 160 + i * 70,
          mode,
          rotate: true,
          onComplete: (object) => (object.tint = 0xe60012),
        }),
      );
    });
  }
}
