// Click a slime to hit it. Each one carries a gauge that follows it; the bar drains with a trail.
import { Graphics, Scene, behaviors, type GameObject } from '@blacklight/core';
import { Gauge, WorldAnchor, damageNumber } from '@blacklight/ui';
import { defineComponent, h, shallowReactive, type PropType } from 'vue';

interface Bar {
  id: number;
  object: GameObject;
  hp: number;
}

const HealthBars = defineComponent({
  props: { bars: { type: Array as PropType<Bar[]>, required: true } },
  setup(props) {
    return () =>
      props.bars.map((bar) =>
        h(WorldAnchor, { key: bar.id, target: bar.object, offset: { x: 0, y: -50 } }, () =>
          h(Gauge, { value: bar.hp, max: 100, style: 'width:110px' }),
        ),
      );
  },
});

class Slime extends Graphics {
  static override behaviors = [behaviors.patrol({ distance: 120, speed: 90, wait: 400 })];
  override create() {
    this.draw
      .ellipse(0, 0, 40, 30)
      .fill(0x8e8e8e)
      .circle(-12, -6, 5)
      .fill(0x111111)
      .circle(12, -6, 5)
      .fill(0x111111);
  }
}

export default class Example extends Scene {
  // Shallow: Vue tracks the list and each hp, and leaves the game objects alone.
  readonly bars = shallowReactive<Bar[]>([]);

  override create() {
    this.spawn(Graphics).draw.rect(0, 0, this.width, this.height).fill(0x181818);
    for (const [i, x, y] of [
      [0, 320, 260],
      [1, 680, 420],
      [2, 980, 260],
    ]) {
      const slime = this.spawn(Slime, { x, y });
      slime.addBehavior(
        behaviors.pointer({
          onClick: () => this.hit(i!),
        }),
      );
      this.bars.push(shallowReactive({ id: i!, object: slime, hp: 100 }));
    }
    this.ui.open(HealthBars, { bars: this.bars });
  }

  private hit(index: number) {
    const bar = this.bars.find((b) => b.id === index);
    if (!bar) return;
    const damage = this.random.int(12, 30);
    bar.hp = Math.max(0, bar.hp - damage);
    damageNumber(this.game, bar.object, damage);
    if (bar.hp === 0) {
      bar.object.destroy();
      this.bars.splice(this.bars.indexOf(bar), 1);
    }
  }
}
