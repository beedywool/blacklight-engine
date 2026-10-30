import { Sprite, behaviors } from '@blacklight/core';
import anims from './hero.anim.json';

/** Frames and animations come from hero.anim.json; its sheet is a 16x16 grid. */
export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [behaviors.eightDirections({ speed: 360 })];
  steps = 0;

  override create() {
    // Frame events named in the .anim.json file.
    this.onFrame('step', () => this.steps++);
  }

  override update() {
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
    if (this.velocity.x !== 0) this.flipX = this.velocity.x < 0;
  }
}
