import { Sprite } from '@blacklight/core';
import anims from './hero.anim.json';

/** Walks between x = 300 and x = 980. Frames and animations come from hero.anim.json. */
export default class Hero extends Sprite {
  static override animations = anims;
  private direction = 1;
  /** True while in the air. */
  jumping = false;

  override create() {
    this.every(2000, () => {
      this.jumping = true;
      this.tween({ y: this.y - 160 }, { duration: 300, yoyo: true, repeat: 1 }).finished.then(
        () => (this.jumping = false),
      );
    });
  }

  override update() {
    this.x += this.direction * 3;
    if (this.x > 980 || this.x < 300) this.direction = -this.direction;
    this.play('run');
    this.flipX = this.direction < 0;
  }
}
