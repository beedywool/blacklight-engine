import { Sprite, behaviors, type GameObject } from '@blacklight/core';
import anims from './hero.anim.json';

export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [behaviors.eightDirections({ speed: 90 })];
  coins = 0;
  steps = 0;

  override create() {
    this.onFrame('step', () => this.steps++);
  }

  override update() {
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
    if (this.velocity.x !== 0) this.flipX = this.velocity.x < 0;
  }

  override onCollide(other: GameObject) {
    if (!other.is('Coin')) return;
    other.destroy();
    this.coins++;
    this.scene.audio.play('coin');
  }
}
