import { Graphics, behaviors } from '@blacklight/core';

/** A coin floating up and down. */
export default class Coin extends Graphics {
  static override behaviors = [behaviors.sineWave({ amplitude: 3, period: 1.2 })];

  override create() {
    this.draw.circle(0, 0, 5).fill(0xffd60a).rect(-1, -3, 2, 6).fill(0xffffff);
  }
}
