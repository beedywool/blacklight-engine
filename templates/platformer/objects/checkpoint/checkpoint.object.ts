import { Sprite } from '@blacklight/core';
import { progress } from '@ui/progress';
import anims from './checkpoint.anim.json';

/** A flag that becomes the hero's respawn point once touched. */
export default class Checkpoint extends Sprite {
  static override animations = anims;
  static override collision = { layer: 'pickup' };

  raise() {
    this.play('up');
    progress.checkpoint = true;
  }
}
