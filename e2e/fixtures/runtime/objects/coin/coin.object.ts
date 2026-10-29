import { Sprite, behaviors } from '@blacklight/core';

export default class Coin extends Sprite {
  static override behaviors = [behaviors.sineWave({ amplitude: 2, period: 0.8 })];
}
