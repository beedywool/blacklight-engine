// A fountain spawns sparks that fall off the scene; destroyOutsideLayout removes each one once it is
// 64 px past an edge, so the object count stays flat instead of growing forever.
import { Graphics, Scene, Text, behaviors } from '@blacklight/core';

class Spark extends Graphics {
  static override behaviors = [behaviors.destroyOutsideLayout()];

  override create() {
    this.draw.rect(-6, -6, 12, 12).fill(0xffffff);
  }
}

export default class Example extends Scene {
  count!: Text;

  override create() {
    this.count = this.spawn(Text, {
      x: 640,
      y: 60,
      style: { fill: 0xc2c2c2, fontFamily: 'monospace', fontSize: 28 },
    });
    this.every(60, () => {
      const spark = this.spawn(Spark, { x: 640, y: 600 });
      spark.addBehavior(
        behaviors.bullet({
          speed: this.random.float(500, 900),
          angle: this.random.float(230, 310),
          gravity: 900,
        }),
      );
      if (this.random.chance(0.3)) spark.tint = 0xe60012;
    });
  }

  override update() {
    this.count.text = `objects in the scene: ${this.objects.length}`;
  }
}
