import { Sprite, behaviors, type EightDirections, type GameObject } from '@blacklight/core';
import anims from './hero.anim.json';

/** Moved with the arrows, WASD or a gamepad; Shift dashes. Picks up coins. */
export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [
    behaviors.eightDirections({ speed: 110, acceleration: 900, deceleration: 1200 }),
  ];
  coins = 0;

  override update() {
    const move = this.behavior<EightDirections>('eightDirections')!;
    move.options.speed = this.input.held('dash') ? 200 : 110;
    this.play(this.velocity.length > 0 ? 'run' : 'idle');
    if (this.velocity.x !== 0) this.flipX = this.velocity.x < 0;
  }

  override onCollide(other: GameObject) {
    if (!other.is('Coin')) return;
    other.destroy();
    this.coins++;
    this.scene.events.emit('coin', this.coins);
  }
}
