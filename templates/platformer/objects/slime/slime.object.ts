import { Sprite, behaviors, type Patrol } from '@blacklight/core';
import anims from './slime.anim.json';

/** An enemy that walks back and forth; the hero squashes it by landing on it. */
export default class Slime extends Sprite {
  static override animations = anims;
  static override collision = { layer: 'enemy' };

  /** Half the walk, in px (set from the Tiled object's `distance` property). */
  distance = 48;
  squashed = false;

  override create() {
    // Added here rather than in `static behaviors`: each slime walks its own distance.
    this.addBehavior(behaviors.patrol({ distance: this.distance, speed: 24 }));
  }

  override update() {
    if (!this.squashed) this.flipX = this.behavior<Patrol>('patrol')!.direction < 0;
  }

  squash() {
    this.squashed = true;
    this.behavior<Patrol>('patrol')!.enabled = false;
    this.velocity.set(0, 0);
    this.play('squashed');
    this.after(400, () => this.destroy());
  }
}
