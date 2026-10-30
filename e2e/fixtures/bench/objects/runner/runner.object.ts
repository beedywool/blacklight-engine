import { AnimatedSprite } from '@blacklight/core';
import anims from './runner.anim.json';

/** A tinted runner that crosses the screen and bounces off its edges, pausing now and then. */
export default class Runner extends AnimatedSprite {
  static override animations = anims;
  // NF-01 measures drawing and animation; collisions are not part of the requirement.
  static override hitbox = 'none' as const;
  private rest = 0;

  override create() {
    const random = this.game.random;
    const angle = random.float(0, Math.PI * 2);
    const speed = random.float(80, 240);
    this.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.view.tint = random.int(0x404040, 0xffffff);
    this.scale.set(random.float(1, 2.5));
    this.rest = random.float(1, 6);
  }

  override update() {
    const { width, height } = this.scene;
    if ((this.x < 0 && this.velocity.x < 0) || (this.x > width && this.velocity.x > 0))
      this.velocity.x *= -1;
    if ((this.y < 0 && this.velocity.y < 0) || (this.y > height && this.velocity.y > 0))
      this.velocity.y *= -1;
    this.flipX = this.velocity.x < 0;
    // Each runner stops for half a second every few seconds: both animations stay in use.
    this.rest -= this.game.time.dt;
    if (this.rest < 0) this.rest = 6;
    this.play(this.rest < 0.5 ? 'idle' : 'run');
  }
}
