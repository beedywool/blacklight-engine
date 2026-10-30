// Each column oscillates another property: y, x, angle, scale and alpha. The phases offset the
// gems of a column so they ripple; the last gem also patrols, and both movements add up.
import { Graphics, Scene, behaviors, type SineOptions } from '@blacklight/core';

class Gem extends Graphics {
  override create() {
    this.draw.poly([0, -30, 22, 0, 0, 30, -22, 0]).fill(0xffffff);
  }
}

const PROPERTIES: { property: SineOptions['property']; amplitude: number }[] = [
  { property: 'y', amplitude: 40 },
  { property: 'x', amplitude: 40 },
  { property: 'angle', amplitude: 45 },
  { property: 'scale', amplitude: 0.4 },
  { property: 'alpha', amplitude: 0.5 },
];

export default class Example extends Scene {
  override create() {
    PROPERTIES.forEach(({ property, amplitude }, column) => {
      for (let row = 0; row < 4; row++) {
        const gem = this.spawn(Gem, { x: 200 + column * 220, y: 160 + row * 120 });
        gem.addBehavior(behaviors.sineWave({ property, amplitude, period: 1.6, phase: row / 8 }));
      }
    });
    const mixed = this.spawn(Gem, { x: 540, y: 660 });
    mixed.tint = 0xe60012;
    mixed.addBehavior(behaviors.patrol({ distance: 200, speed: 160 }));
    mixed.addBehavior(behaviors.sineWave({ amplitude: 20, period: 0.5 }));
  }
}
