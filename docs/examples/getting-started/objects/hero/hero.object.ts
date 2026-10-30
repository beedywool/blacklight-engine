import { Sprite, behaviors } from '@blacklight/core';
import anims from './hero.anim.json';

export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [
    behaviors.eightDirections({ speed: 480, acceleration: 4000, deceleration: 5000 }),
  ];

  override update() {
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
    if (this.velocity.x !== 0) this.flipX = this.velocity.x < 0;
  }
}
