import { Sprite, behaviors } from '@blacklight/core';
import anims from './hero.anim.json';

export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [behaviors.eightDirections({ speed: 90 })];
  hp = 3;

  /** The hot reload e2e edits this text. */
  greeting() {
    return 'hello';
  }

  override update() {
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
  }
}
