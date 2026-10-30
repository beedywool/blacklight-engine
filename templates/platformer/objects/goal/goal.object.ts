import { Sprite } from '@blacklight/core';
import anims from './goal.anim.json';

/** The end of the level. */
export default class Goal extends Sprite {
  static override animations = anims;
  static override collision = { layer: 'pickup' };
}
