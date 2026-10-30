import { Sprite, behaviors } from '@blacklight/core';
import anims from './coin.anim.json';

/** A spinning coin floating above the ground; the hero picks it up on contact. */
export default class Coin extends Sprite {
  static override animations = anims;
  static override behaviors = [behaviors.sineWave({ amplitude: 1.5, period: 1.2 })];
  static override collision = { layer: 'pickup' };
}
