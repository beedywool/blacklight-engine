// UI anchored to game objects: health bars follow the enemies while the camera pans. Click an enemy
// to hit it (a floating damage number rises from it); a red bar at the edge points to the one off screen.
import { Graphics, Scene, behaviors } from '@blacklight/core';
import { Gauge, WorldAnchor, damageNumber } from '@blacklight/ui';
import { defineComponent, h, reactive, type PropType } from 'vue';

class Enemy extends Graphics {
  static override behaviors = [behaviors.sineWave({ property: 'y', amplitude: 60, period: 2 })];

  override create() {
    this.draw.roundRect(-50, -50, 100, 100, 24).fill(0xffffff);
  }
}

const Bars = defineComponent({
  props: {
    enemies: { type: Array as PropType<Enemy[]>, required: true },
    hp: { type: Array as PropType<number[]>, required: true },
  },
  setup: (props) => () =>
    props.enemies.map((enemy, i) =>
      h(
        WorldAnchor,
        // `clamp` keeps the last bar at the screen edge when its enemy is off screen.
        {
          key: enemy.id,
          target: enemy,
          offset: { x: 0, y: -80 },
          clamp: i === props.enemies.length - 1,
        },
        () => h(Gauge, { value: props.hp[i]!, max: 100, style: 'width:160px' }),
      ),
    ),
});

export default class Example extends Scene {
  static override size = { width: 2400, height: 720 };
  private enemies: Enemy[] = [];
  // Reactive, so the gauges follow it.
  private hp = reactive<number[]>([]);

  override create() {
    this.spawn(Graphics)
      .draw.rect(0, 0, 2400, 720)
      .fill(0x181818)
      .rect(0, 600, 2400, 120)
      .fill(0x2c2c2c);
    for (const x of [300, 700, 1100, 2200]) {
      this.enemies.push(this.spawn(Enemy, { x, y: 400 }));
      this.hp.push(100);
    }
    this.ui.open(Bars, { enemies: this.enemies, hp: this.hp });
  }

  override update() {
    this.camera.centerOn(640 + Math.sin(this.steps / 200) * 500, 360);
    if (!this.pointer.pressed) return;
    this.enemies.forEach((enemy, i) => {
      if (Math.abs(this.pointer.x - enemy.x) > 50 || Math.abs(this.pointer.y - enemy.y) > 50)
        return;
      const damage = 10 + this.random.int(0, 20);
      this.hp[i] = Math.max(0, this.hp[i]! - damage);
      damageNumber(this.game, enemy, damage, { critical: damage > 25 });
    });
  }
}
