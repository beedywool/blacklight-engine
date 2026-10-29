import { behaviors, lerp } from '@blacklight/core';
import { Model3D } from '@blacklight/three';

/**
 * The player: a skinned glTF robot moved like a 2D character. It walks with the arrows, WASD, the
 * stick or the D-pad, turns towards where it goes, and waves on X / Shift.
 */
export default class Hero extends Model3D {
  static override model = '@models/hero.glb';
  static override pixelsPerUnit = 110;
  static override animations = { wave: { loop: false, next: 'idle' } };
  static override behaviors = [
    behaviors.eightDirections({ speed: 260, acceleration: 2400, deceleration: 3000 }),
  ];
  static override collision = { layer: 'player' };

  private waving = false;

  override create() {
    this.onEnd(() => (this.waving = false));
  }

  override update() {
    const moving = this.velocity.length > 1;
    if (this.input.pressed('action')) {
      this.waving = true;
      this.play('wave', { restart: true });
    }
    if (moving) this.waving = false;
    if (!this.waving) this.play(moving ? 'walk' : 'idle');
    // Face the direction of travel: yaw 0 looks at the viewer (down the screen).
    if (moving) {
      const target = Math.atan2(this.velocity.x, this.velocity.y);
      let delta = target - this.rotation3d.y;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.rotation3d.y = lerp(this.rotation3d.y, this.rotation3d.y + delta, 0.25);
    }
    // Sorted with the bushes and the other models of the layer.
    this.zIndex = this.y;
  }
}
