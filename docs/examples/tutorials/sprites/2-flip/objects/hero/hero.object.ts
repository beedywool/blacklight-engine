import { Sprite } from '@blacklight/core';
import anims from './hero.anim.json';

/** Walks between x = 300 and x = 980. Frames and animations come from hero.anim.json. */
export default class Hero extends Sprite {
  static override animations = anims;
  private direction = 1;

  override update() {
    this.x += this.direction * 3;
    if (this.x > 980 || this.x < 300) this.direction = -this.direction;
    this.play('run');
  }
}
