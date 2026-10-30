import { Sprite, behaviors, type Flash, type GameObject, type Platformer } from '@blacklight/core';
import type Checkpoint from '@objects/checkpoint/checkpoint.object';
import type Slime from '@objects/slime/slime.object';
import { progress } from '@ui/progress';
import anims from './hero.anim.json';

/**
 * The player. `platformer` does the running and jumping (coyote time, jump buffer, one-way
 * planks); this class picks the animation and reacts to what it touches.
 */
export default class Hero extends Sprite {
  static override animations = anims;
  static override behaviors = [
    behaviors.platformer({ speed: 110, jumpStrength: 290, gravity: 800, maxFall: 420 }),
    behaviors.flash({ interval: 60 }),
  ];
  static override collision = { layer: 'player' };

  /** Where the hero comes back after a hit: the start, then the last checkpoint. */
  respawn = { x: 0, y: 0 };

  get platformer(): Platformer {
    return this.behavior<Platformer>('platformer')!;
  }

  override create() {
    this.respawn = { x: this.x, y: this.y };
  }

  override update() {
    const move = this.platformer;
    if (move.onGround && this.input.pressed('jump')) this.scene.audio.play('jump');
    this.play(move.state);
    this.flipX = move.facing === 'left';
    // Fell into a pit: the level is 17 tiles high.
    if (this.y > 17 * 16 + 32) this.hurt();
  }

  override onCollide(other: GameObject) {
    if (other.is('Coin')) {
      other.destroy();
      progress.coins++;
      this.scene.audio.play('coin');
    } else if (other.is('Slime')) {
      // Landing on top squashes it; any other contact hurts.
      const slime = other as Slime;
      if (!slime.alive || slime.squashed) return;
      // Feet above its top (9 px tall) at the start of the step: a stomp.
      if (this.velocity.y > 0 && this.prevY <= slime.y - 6) {
        slime.squash();
        this.platformer.jump(200);
        this.scene.audio.play('stomp');
      } else {
        this.hurt();
      }
    } else if (other.is('Checkpoint')) {
      if (this.respawn.x < other.x) {
        this.respawn = { x: other.x, y: other.y };
        (other as Checkpoint).raise();
      }
    } else if (other.is('Goal') && !progress.cleared) {
      progress.cleared = true;
      this.scene.audio.play('clear');
    }
  }

  /** Back to the last checkpoint, blinking for a moment. */
  hurt() {
    const flash = this.behavior<Flash>('flash')!;
    if (flash.flashing) return;
    this.scene.audio.play('hurt');
    this.scene.camera.shake(4, 200);
    this.teleport(this.respawn.x, this.respawn.y);
    this.velocity.set(0, 0);
    flash.start(1200);
    progress.hits++;
  }
}
